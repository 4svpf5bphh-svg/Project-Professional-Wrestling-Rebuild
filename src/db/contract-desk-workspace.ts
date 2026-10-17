import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {contractDeskEntry} from "../domain/contract-desk.js";
import type {ContractAvailabilityInput} from "../domain/contract-availability.js";

/** One consistent World-clock snapshot, including pending negotiations.
 * No client-supplied week, and no second unguarded roster request. */
export async function readContractDesk(
 pool:TransactionPool,worldId:string,playerId:string,promotionId:string,
){
 if(!worldId||!playerId||!promotionId)throw new Error("Invalid contract desk identity");
 return withSqlClient(pool,async tx=>{
  const auth=await tx.query<{year:number;week:number;
   revision:string|number;can_edit:boolean}>(`
   SELECT w.year,w.week,w.revision,
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit
   FROM ppw_worlds w
   JOIN ppw_promotion_controls c ON c.world_id=w.world_id
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
   WHERE w.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3
     AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
   [worldId,playerId,promotionId]);
  if(auth.length!==1)throw new Error("Promotion access denied");
  const currentWeekIndex=(auth[0]!.year-1)*52+auth[0]!.week-1;
  const contracts=await tx.query<{
   contract_id:string;person_id:string;name:string;
   family:ContractAvailabilityInput["family"];status:ContractAvailabilityInput["status"];
   remaining_dates:number|null;expires_week_index:number;start_week_index:number;
   date_entitlement:number|null;weekly_guarantee:string;appearance_fee:string;signing_bonus:string;
   creative_control:string;role_expectation:string;
   backstage_contract_request_id:string|null;
  }>(`
   SELECT c.contract_id,c.person_id,p.name,c.family,c.status,
     c.remaining_dates,c.expires_week_index,c.start_week_index,c.date_entitlement,c.weekly_guarantee,
     c.appearance_fee,c.signing_bonus,c.creative_control,c.role_expectation,
     (SELECT request_id FROM ppw_backstage_requests r
      WHERE r.world_id=c.world_id AND r.promotion_id=c.promotion_id
        AND r.person_id=c.person_id AND r.kind='CONTRACT'
        AND r.decision='EXPLORE_RENEWAL' AND r.status='ANSWERED'
        AND r.responded_week_index BETWEEN greatest(0,$3-12) AND $3
        AND r.created_week_index>=greatest(0,$3-26)
      ORDER BY r.created_week_index DESC,r.request_id DESC LIMIT 1)
       AS backstage_contract_request_id
   FROM ppw_contracts c JOIN ppw_people p
     ON p.world_id=c.world_id AND p.person_id=c.person_id
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.status='SIGNED'
   ORDER BY c.expires_week_index,p.name,c.contract_id LIMIT 200`,
   [worldId,promotionId,currentWeekIndex]);
  const requests=await tx.query<{
   request_id:string;contract_id:string;person_id:string;
   additional_dates:number;additional_payment:string|number;
   status:string;created_week_index:number;
  }>(`
   SELECT request_id,contract_id,person_id,additional_dates,additional_payment,status,created_week_index
   FROM ppw_contract_date_requests
   WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING'
   ORDER BY created_week_index,request_id LIMIT 200`,
   [worldId,promotionId]);
  const renewals=await tx.query<{proposal_id:string;contract_id:string;person_id:string;status:string;created_week_index:number;proposed_terms:unknown}>(`SELECT proposal_id,contract_id,person_id,status,created_week_index,proposed_terms FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING' ORDER BY created_week_index,proposal_id LIMIT 200`,[worldId,promotionId]);
  const offers=await tx.query<{offer_id:string;person_id:string;source_contract_id:string|null;
   terms:unknown;submitted_week_index:number}>(`SELECT offer_id,person_id,source_contract_id,terms,submitted_week_index
   FROM ppw_contract_offers WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING'
   ORDER BY submitted_week_index DESC,offer_id LIMIT 200`,[worldId,promotionId]);
  const byContract=new Map(contracts.map(c=>[c.contract_id,c]));
  const roster=contracts.map(c=>contractDeskEntry({
   contractId:c.contract_id,personId:c.person_id,name:c.name,
   family:c.family,status:c.status,remainingDates:c.remaining_dates,
   expiresWeekIndex:c.expires_week_index,startWeekIndex:c.start_week_index,currentWeekIndex,
  }));
  const pendingIds=new Set(requests.map(q=>q.contract_id));
  const renewalIds=new Set(renewals.map(q=>q.contract_id));
  return {
   currentWeekIndex,year:auth[0]!.year,week:auth[0]!.week,
   worldRevision:Number(auth[0]!.revision),canEdit:auth[0]!.can_edit,
   roster:roster.map(c=>{const cost=byContract.get(c.contractId)!;return {...c,
    dateEntitlement:cost.date_entitlement,weeklyGuarantee:Number(cost.weekly_guarantee),
    appearanceFee:Number(cost.appearance_fee),signingBonus:Number(cost.signing_bonus),
    roleExpectation:cost.role_expectation,creativeControl:cost.creative_control,
    pendingNegotiation:pendingIds.has(c.contractId),pendingRenewal:renewalIds.has(c.contractId),
    backstageContractConversationId:cost.backstage_contract_request_id};}),
   requests,
   renewals,offers,
   summary:{
    signed:roster.length,expiringSoon:roster.filter(c=>c.expiringSoon).length,
    noDates:roster.filter(c=>c.reason==="NO_DATES").length,
    backstageContractDiscussions:contracts.filter(c=>c.backstage_contract_request_id!==null).length,
    pendingNegotiations:requests.length,
    pendingRenewals:renewals.length,pendingOffers:offers.length,
    weeklyGuarantees:contracts.reduce((sum,c)=>sum+Number(c.weekly_guarantee),0),
   },
  };
 });
}
