import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {canAddDates,addendumUtility,requireEconomics,type PersonEconomics,type ExistingCommitment,type Role} from "../domain/contract-economics.js";

export interface ResolveDateRequestInput {
 worldId:string;playerId:string;promotionId:string;dateRequestId:string;
 requestId:string;expectedRevision:number;decision:"ACCEPTED"|"REJECTED";
}
/** Original addendum: wrestler response, remaining-term capacity, incremental
 * bonus and ledger are one idempotent World command. Never exposed to a player.
 */
export async function resolveDateRequest(pool:TransactionPool,input:ResolveDateRequestInput,
 authorization:{source:"WORLD_RESOLUTION";worldId:string}){
 if(authorization.source!=="WORLD_RESOLUTION"||authorization.worldId!==input.worldId)
  throw new Error("World resolution authority required");
 if(!input.dateRequestId||!input.promotionId||!["ACCEPTED","REJECTED"].includes(input.decision))
  throw new Error("Invalid date negotiation decision");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"RESOLVE_DATE_NEGOTIATION",
  execute:async tx=>{
   const req=await tx.query<{contract_id:string;person_id:string;promotion_id:string;
    additional_dates:number;additional_payment:string;status:string}>(`
     SELECT contract_id,person_id,promotion_id,additional_dates,additional_payment,status
     FROM ppw_contract_date_requests WHERE world_id=$1 AND request_id=$2 FOR UPDATE`,
     [input.worldId,input.dateRequestId]);
   if(req.length!==1||req[0]!.status!=="PENDING")throw new Error("Pending date request not found");
   const r=req[0]!;
   if(r.promotion_id!==input.promotionId)throw new Error("Promotion mismatch");
   const rows=await tx.query<{family:ExistingCommitment["family"];status:string;
    remaining_dates:number|null;start_week_index:number;expires_week_index:number;appearance_fee:string;role_expectation:Role}>(`
    SELECT family,status,remaining_dates,start_week_index,expires_week_index,appearance_fee,role_expectation
    FROM ppw_contracts WHERE world_id=$1 AND contract_id=$2 AND promotion_id=$3 FOR UPDATE`,
    [input.worldId,r.contract_id,input.promotionId]);
   if(rows.length!==1)throw new Error("Contract missing");
   const contract=rows[0]!;
   const clocks=await tx.query<{year:number;week:number;seed:string|number;offer_acceptance_threshold:number}>(`SELECT year,week,seed,offer_acceptance_threshold FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
   if(clocks.length!==1)throw new Error("World clock missing");
   const {year,week}=clocks[0]!,current=(year-1)*52+week-1;
   let decision=input.decision;
   if(contract.status!=="SIGNED"||contract.family!=="LIMITED_NON_EXCLUSIVE"
     ||contract.remaining_dates===null||contract.expires_week_index<current
     ||contract.start_week_index>current)decision="REJECTED";
   if(decision==="ACCEPTED"){
    const persons=await tx.query<{career_stage:PersonEconomics["careerStage"];morale:number;
     recognition:number;popularity:number;in_ring_quality:number;match_craft:number;
     presentation:number;stamina:number;fatigue:number;contract_priorities:PersonEconomics["priorities"]}>(`
     SELECT career_stage,morale,recognition,popularity,in_ring_quality,match_craft,presentation,
       stamina,fatigue,contract_priorities FROM ppw_people WHERE world_id=$1 AND person_id=$2`,
     [input.worldId,r.person_id]);
    if(persons.length!==1)throw new Error("Wrestler not found");
    const person=persons[0]!;
    const p:PersonEconomics={careerStage:person.career_stage,morale:person.morale,
     recognition:person.recognition,popularity:person.popularity,inRingQuality:person.in_ring_quality,
     matchCraft:person.match_craft,presentation:person.presentation,stamina:person.stamina,
     fatigue:person.fatigue,priorities:person.contract_priorities};
    requireEconomics(p);
    const others=await tx.query<{contract_id:string;family:ExistingCommitment["family"];
     status:string;remaining_dates:number|null;start_week_index:number;expires_week_index:number}>(`
     SELECT contract_id,family,status,remaining_dates,start_week_index,expires_week_index
     FROM ppw_contracts WHERE world_id=$1 AND person_id=$2 AND status='SIGNED'
     AND contract_id<>$3 ORDER BY contract_id LIMIT 100`,
     [input.worldId,r.person_id,r.contract_id]);
    const commitments:ExistingCommitment[]=others.map(c=>({
     contractId:c.contract_id,family:c.family,status:c.status,remainingDates:c.remaining_dates,
     startWeekIndex:c.start_week_index,expiresWeekIndex:c.expires_week_index}));
    const invalid=canAddDates(p,{
     contractId:r.contract_id,family:contract.family,status:contract.status,
     remainingDates:contract.remaining_dates,startWeekIndex:contract.start_week_index,
     expiresWeekIndex:contract.expires_week_index,
    },r.additional_dates,commitments,current);
    if(invalid)decision="REJECTED";
    if(decision==="ACCEPTED"){
     const promotions=await tx.query<{tier:string;media_reach:number|null}>(`
      SELECT tier,media_reach FROM ppw_promotions WHERE world_id=$1 AND promotion_id=$2`,
      [input.worldId,input.promotionId]);
     if(promotions.length!==1||promotions[0]!.media_reach===null)
      throw new Error("Original promotion contract economics not imported");
     const utility=addendumUtility(p,{
      roleExpectation:contract.role_expectation,appearanceFee:Number(contract.appearance_fee),
     },r.additional_dates,Number(r.additional_payment),
       Math.max(1,contract.expires_week_index-current),{
      tier:promotions[0]!.tier,mediaReach:promotions[0]!.media_reach!,
      trust:50,seed:String(clocks[0]!.seed),offerId:input.dateRequestId,
     });
     if(utility<clocks[0]!.offer_acceptance_threshold)decision="REJECTED";
    }
   }
   if(decision==="ACCEPTED"){
    const updated=await tx.query<{contract_id:string}>(`
     UPDATE ppw_contracts SET remaining_dates=remaining_dates+$4,
     date_entitlement=COALESCE(date_entitlement,remaining_dates)+$4,
     revision=revision+1 WHERE world_id=$1 AND promotion_id=$2 AND contract_id=$3
     AND family='LIMITED_NON_EXCLUSIVE' AND status='SIGNED'
     AND remaining_dates IS NOT NULL AND remaining_dates<=$5
     AND expires_week_index>=$6 RETURNING contract_id`,
     [input.worldId,input.promotionId,r.contract_id,r.additional_dates,
      2147483647-r.additional_dates,current]);
    if(updated.length!==1)throw new Error("Contract date allowance overflow");
    const payment=Number(r.additional_payment);
    if(payment>0){
     await tx.query(`UPDATE ppw_promotions SET cash=cash-$3 WHERE world_id=$1 AND promotion_id=$2`,
      [input.worldId,input.promotionId,payment]);
     await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
       VALUES($1,$2,$3,'CONTRACT_EXTRA_DATES_ACCEPTED',jsonb_build_object(
         'contractId',$4::text,'additionalDates',$5::integer,'additionalPayment',$6::bigint))`,
       [input.worldId,year,week,r.contract_id,r.additional_dates,payment]);
    }
   }
   await tx.query(`UPDATE ppw_contract_date_requests SET status=$3
     WHERE world_id=$1 AND request_id=$2 AND status='PENDING'`,
     [input.worldId,input.dateRequestId,decision]);
   return {dateRequestId:input.dateRequestId,contractId:r.contract_id,
    decision,datesGranted:decision==="ACCEPTED"?r.additional_dates:0,
    additionalPayment:decision==="ACCEPTED"?Number(r.additional_payment):0};
  }});
}
