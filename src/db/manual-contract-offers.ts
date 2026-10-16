import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {applyWorldCommand} from "./world-commands.js";
import {withSqlClient} from "./postgres.js";
import {canAcceptTerms,offerUtility,requireEconomics,validateOfferTerms,
 type OfferTerms,type PersonEconomics,type ExistingCommitment} from "../domain/contract-economics.js";

type ProfileRow={
 person_id:string;status:string;recognition:number|null;popularity:number|null;
 in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
 stamina:number|null;fatigue:number|null;career_stage:PersonEconomics["careerStage"]|null;
 morale:number|null;contract_priorities:PersonEconomics["priorities"]|null;
};
type ContractRow={contract_id:string;person_id:string;promotion_id:string;family:ExistingCommitment["family"];
 status:string;remaining_dates:number|null;start_week_index:number;expires_week_index:number};
type PendingRow={offer_id:string;person_id:string;promotion_id:string;source_contract_id:string|null;
 submitted_week_index:number;terms:OfferTerms;tier:string;media_reach:number|null;
 has_history:boolean;};
function profile(row:ProfileRow):PersonEconomics{
 const p={recognition:row.recognition,popularity:row.popularity,inRingQuality:row.in_ring_quality,
 matchCraft:row.match_craft,presentation:row.presentation,stamina:row.stamina,
 fatigue:row.fatigue,careerStage:row.career_stage,morale:row.morale,priorities:row.contract_priorities};
 requireEconomics(p as PersonEconomics);
 return p as PersonEconomics;
}
function commitment(row:ContractRow):ExistingCommitment{
 return {contractId:row.contract_id,family:row.family,status:row.status,remainingDates:row.remaining_dates,
 startWeekIndex:row.start_week_index,expiresWeekIndex:row.expires_week_index};
}
const controllerSql=`SELECT c.promotion_id FROM ppw_promotion_controls c
 JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
 JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
 WHERE c.world_id=$1 AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
 AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`;
const peopleSql=`SELECT person_id,status,recognition,popularity,in_ring_quality,match_craft,
 presentation,stamina,fatigue,career_stage,morale,contract_priorities
 FROM ppw_people WHERE world_id=$1 AND person_id=$2`;
const contractsSql=`SELECT contract_id,person_id,promotion_id,family,status,remaining_dates,
 start_week_index,expires_week_index FROM ppw_contracts
 WHERE world_id=$1 AND person_id=$2 AND status='SIGNED' ORDER BY expires_week_index,contract_id LIMIT 100`;
export interface ManualContractOfferInput {
 worldId:string;playerId:string;promotionId:string;personId:string;sourceContractId?:string|null;
 requestId:string;expectedRevision:number;terms:OfferTerms;
}
/** Original human-contract offer semantics with a narrow person-scoped read.
 * Proposal creates no contract, no debit, and no employer power.
 */
export async function submitManualContractOffer(pool:TransactionPool,input:ManualContractOfferInput){
 if(!input.personId||input.personId.length>200||!input.promotionId||input.promotionId.length>200)
  throw new Error("Invalid offer identity");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
 expectedRevision:input.expectedRevision,commandType:"SUBMIT_CONTRACT_OFFER",requiresOpenWeek:true,
 execute:async tx=>{
  const owner=await tx.query<{promotion_id:string}>(controllerSql,[input.worldId,input.playerId,input.promotionId]);
  if(owner.length!==1)throw new Error("Promotion access denied");
  const world=await tx.query<{year:number;week:number}>(`SELECT year,week FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
  const current=(world[0]!.year-1)*52+world[0]!.week-1;
  validateOfferTerms(input.terms,current);
  const people=await tx.query<ProfileRow>(peopleSql,[input.worldId,input.personId]);
  if(people.length!==1||people[0]!.status==="RETIRED")throw new Error("Wrestler unavailable");
  const p=profile(people[0]!);
  const signed=await tx.query<ContractRow>(contractsSql,[input.worldId,input.personId]);
  const source=input.sourceContractId??null;
  if(source){
   const sourceRow=signed.find(c=>c.contract_id===source);
   if(!sourceRow||sourceRow.promotion_id!==input.promotionId||sourceRow.family==="ONE_OFF"
    ||sourceRow.expires_week_index<current)throw new Error("Invalid renewal source contract");
   if(input.terms.startWeekIndex!==sourceRow.expires_week_index+1)
    throw new Error("Renewal must start after the current contract expires");
   // The original paid term is not overwritten before its final week.
   if(input.terms.family!==sourceRow.family)throw new Error("Changing contract family requires a new agreement");
   const accepted=await tx.query<{proposal_id:string}>(`SELECT proposal_id FROM ppw_contract_renewal_proposals
    WHERE world_id=$1 AND contract_id=$2 AND status IN ('ACCEPTED','PENDING') LIMIT 1`,
    [input.worldId,source]);
   if(accepted.length)throw new Error("Renewal already arranged");
  } else if(input.terms.startWeekIndex!==current)
   throw new Error("Recruitment offer must start in the current week");
  const reason=canAcceptTerms(p,input.terms,signed.map(commitment),current);
  if(reason)throw new Error(reason);
  const pending=await tx.query<{offer_id:string}>(`SELECT offer_id FROM ppw_contract_offers
   WHERE world_id=$1 AND person_id=$2 AND promotion_id=$3 AND status='PENDING' LIMIT 1`,
   [input.worldId,input.personId,input.promotionId]);
  if(pending.length)throw new Error("An offer to this wrestler is already pending");
  await tx.query(`INSERT INTO ppw_contract_offers
   (world_id,offer_id,person_id,promotion_id,source_contract_id,submitted_week_index,terms)
   VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)`,
   [input.worldId,input.requestId,input.personId,input.promotionId,source,current,JSON.stringify(input.terms)]);
  return {offerId:input.requestId,personId:input.personId,sourceContractId:source,status:"PENDING" as const};
 }});
}
export async function withdrawManualContractOffer(pool:TransactionPool,input:{
 worldId:string;playerId:string;promotionId:string;offerId:string;requestId:string;expectedRevision:number;
}){
 if(!input.promotionId||!input.offerId)throw new Error("Invalid offer withdrawal");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
 expectedRevision:input.expectedRevision,commandType:"WITHDRAW_CONTRACT_OFFER",requiresOpenWeek:true,
 execute:async tx=>{
  const owner=await tx.query<{promotion_id:string}>(controllerSql,[input.worldId,input.playerId,input.promotionId]);
  if(owner.length!==1)throw new Error("Promotion access denied");
  const updated=await tx.query<{offer_id:string}>(`UPDATE ppw_contract_offers SET status='WITHDRAWN'
   WHERE world_id=$1 AND offer_id=$2 AND promotion_id=$3 AND status='PENDING' RETURNING offer_id`,
   [input.worldId,input.offerId,input.promotionId]);
  if(updated.length!==1)throw new Error("Pending offer not found");
  return {offerId:input.offerId,status:"WITHDRAWN" as const};
 }});
}
/** Player-private inbox: never returns other promotions' wages or offers. */
export async function readPendingContractOffers(pool:TransactionPool,worldId:string,playerId:string,promotionId:string){
 return withSqlClient(pool,async tx=>{
  if((await tx.query(controllerSql,[worldId,playerId,promotionId])).length!==1)
   throw new Error("Promotion access denied");
  return tx.query<{offer_id:string;person_id:string;source_contract_id:string|null;terms:OfferTerms;
    status:string;submitted_week_index:number}>(`SELECT offer_id,person_id,source_contract_id,
    terms,status,submitted_week_index FROM ppw_contract_offers WHERE world_id=$1 AND promotion_id=$2
    AND status='PENDING' ORDER BY submitted_week_index DESC,offer_id LIMIT 100`,[worldId,promotionId]);
 });
}
export interface ResolvePersonOffersInput {
 worldId:string;personId:string;requestId:string;expectedRevision:number;
}
/** One deterministic wrestler answer for all current-week competing bids.
 * Original PPW ranks viable exclusive offers, then non-exclusive offers.
 * Trusted World resolution only; no player decision parameter.
 */
export async function resolvePersonContractOffers(pool:TransactionPool,input:ResolvePersonOffersInput,
 authorization:{source:"WORLD_RESOLUTION";worldId:string}){
 if(authorization.source!=="WORLD_RESOLUTION"||authorization.worldId!==input.worldId)
  throw new Error("World resolution authority required");
 if(!input.personId||input.personId.length>200)throw new Error("Invalid wrestler");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:"system",requestId:input.requestId,
 expectedRevision:input.expectedRevision,commandType:"RESOLVE_PERSON_OFFERS",
 execute:async tx=>{
  const clock=await tx.query<{year:number;week:number;seed:string|number;offer_acceptance_threshold:number}>(`SELECT year,week,seed,offer_acceptance_threshold FROM ppw_worlds WHERE world_id=$1`,[input.worldId]);
  const current=(clock[0]!.year-1)*52+clock[0]!.week-1;
  const bids=await tx.query<PendingRow>(`SELECT o.offer_id,o.person_id,o.promotion_id,o.source_contract_id,
   o.submitted_week_index,o.terms,p.tier,p.media_reach,
   EXISTS(SELECT 1 FROM ppw_contracts h WHERE h.world_id=o.world_id
    AND h.person_id=o.person_id AND h.promotion_id=o.promotion_id) AS has_history
   FROM ppw_contract_offers o JOIN ppw_promotions p ON p.world_id=o.world_id
    AND p.promotion_id=o.promotion_id
   WHERE o.world_id=$1 AND o.person_id=$2 AND o.status='PENDING'
     AND o.submitted_week_index<=$3 ORDER BY o.offer_id LIMIT 100`,[input.worldId,input.personId,current]);
  if(!bids.length)return {personId:input.personId,accepted:0,rejected:0};
  const people=await tx.query<ProfileRow>(peopleSql,[input.worldId,input.personId]);
  if(people.length!==1)throw new Error("Wrestler not found");
  const p=profile(people[0]!);
  const existing=await tx.query<ContractRow>(contractsSql,[input.worldId,input.personId]);
  const signed=existing.map(commitment);
  const rated=bids.map(b=>{
   validateOfferTerms(b.terms,b.submitted_week_index);
   if(b.media_reach===null)throw new Error("Original promotion media reach not imported");
   const score=offerUtility(p,b.terms,{tier:b.tier,mediaReach:b.media_reach,
    hasPriorRelationship:b.has_history,trust:50,seed:String(clock[0]!.seed),offerId:b.offer_id});
   // Original renewal resistance penalises low morale/trust near acceptance threshold.
   const penalty=b.source_contract_id?Math.round(Math.max(0,55-(p.morale+50)/2)*.2*10)/10:0;
   return {...b,score:Math.round((score-penalty)*10)/10};
  }).sort((a,b)=>b.score-a.score||a.offer_id.localeCompare(b.offer_id));
  const threshold=clock[0]!.offer_acceptance_threshold;
  const decisions:{id:string;status:"ACCEPTED"|"REJECTED";score:number;reason:string|null}[]=[];
  const contractsToSign:{id:string;promotion:string;person:string;terms:OfferTerms}[]=[];
  const renewals:{source:string;promotion:string;person:string;offerId:string;terms:OfferTerms}[]=[];
  const charges=new Map<string,number>();
  const tryBid=(b:typeof rated[number])=>{
   let reason:string|null=null;
   const t=b.terms;
   if(b.score<threshold)reason="offer utility below acceptance threshold";
   if(people[0]!.status==="RETIRED")reason="wrestler retired";
   if(t.startWeekIndex<current)reason="offer start has passed";
   const source=b.source_contract_id?existing.find(c=>c.contract_id===b.source_contract_id):null;
   if(b.source_contract_id&&(!source||source.status!=="SIGNED"||source.expires_week_index<current
    ||t.startWeekIndex!==source.expires_week_index+1))reason="renewal source is no longer available";
   if(!reason)reason=canAcceptTerms(p,t,signed,current);
   if(!reason&&t.family==="EXCLUSIVE"&&signed.some(c=>c.status==="SIGNED"&&
     c.startWeekIndex<=t.startWeekIndex+t.termWeeks-1&&c.expiresWeekIndex>=t.startWeekIndex))
    reason="overlapping signed contract";
   if(!reason){
    if(source)renewals.push({source:source.contract_id,promotion:b.promotion_id,person:b.person_id,offerId:b.offer_id,terms:t});
    else contractsToSign.push({id:"offer:"+b.offer_id,promotion:b.promotion_id,person:b.person_id,terms:t});
    charges.set(b.promotion_id,(charges.get(b.promotion_id)??0)+t.signingBonus);
    signed.push({contractId:"offer:"+b.offer_id,family:t.family,status:"SIGNED",
     remainingDates:t.family==="EXCLUSIVE"?null:t.dateEntitlement,
     startWeekIndex:t.startWeekIndex,expiresWeekIndex:t.startWeekIndex+t.termWeeks-1});
   }
   decisions.push({id:b.offer_id,status:reason?"REJECTED":"ACCEPTED",score:b.score,reason});
  };
  // Prefer strongest acceptable exclusives before any overlapping limited bids,
  // as in original resolveContractOffers.
  for(const b of rated.filter(x=>x.terms.family==="EXCLUSIVE"))tryBid(b);
  for(const b of rated.filter(x=>x.terms.family!=="EXCLUSIVE"))tryBid(b);
  // One batched mutation per table, independent of historical roster size.
  await tx.query(`UPDATE ppw_contract_offers o SET status=d.status,resolved_utility=d.score,
    rejection_reason=d.reason FROM jsonb_to_recordset($2::jsonb)
    AS d(id text,status text,score double precision,reason text)
    WHERE o.world_id=$1 AND o.offer_id=d.id AND o.status='PENDING'`,
    [input.worldId,JSON.stringify(decisions)]);
  if(contractsToSign.length)await tx.query(`INSERT INTO ppw_contracts
    (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,
      start_week_index,expires_week_index,date_entitlement,weekly_guarantee,appearance_fee,
      signing_bonus,role_expectation,creative_control)
    SELECT $1,v.id,v.person,v.promotion,v.family,'SIGNED',
      CASE WHEN v.family='EXCLUSIVE' THEN NULL ELSE v.entitlement END,
      v.start_week,v.start_week+v.term_weeks-1,v.entitlement,v.weekly,v.appearance,
      v.bonus,v.role,v.creative
    FROM jsonb_to_recordset($2::jsonb) AS v(id text,person text,promotion text,
     family text,start_week integer,term_weeks integer,entitlement integer,weekly bigint,
     appearance bigint,bonus bigint,role text,creative text)`,[input.worldId,JSON.stringify(contractsToSign.map(c=>({
      id:c.id,person:c.person,promotion:c.promotion,family:c.terms.family,
      start_week:Math.max(c.terms.startWeekIndex,current+1),term_weeks:c.terms.termWeeks,
      entitlement:c.terms.dateEntitlement,weekly:c.terms.weeklyGuarantee,
      appearance:c.terms.appearanceFee,bonus:c.terms.signingBonus,
      role:c.terms.roleExpectation,creative:c.terms.creativeControl})))]);
  if(renewals.length) {
   const reserved=await tx.query<{contract_id:string}>(`SELECT contract_id FROM ppw_contract_renewal_proposals
     WHERE world_id=$1 AND contract_id=ANY($2::text[]) AND status IN ('ACCEPTED','PENDING') LIMIT 1`,
     [input.worldId,renewals.map(r=>r.source)]);
   if(reserved.length)throw new Error("Renewal already reserved");
   await tx.query(`INSERT INTO ppw_contract_renewal_proposals
     (world_id,proposal_id,contract_id,promotion_id,person_id,status,created_week_index,proposed_terms)
     SELECT $1,v.id,v.source,v.promotion,v.person,'ACCEPTED',$3,v.terms::jsonb
     FROM jsonb_to_recordset($2::jsonb) AS v(id text,source text,promotion text,person text,terms text)`,
     [input.worldId,JSON.stringify(renewals.map(r=>({id:"accepted:"+r.offerId,source:r.source,
       promotion:r.promotion,person:r.person,terms:JSON.stringify({
       family:r.terms.family,termWeeks:r.terms.termWeeks,dateEntitlement:r.terms.dateEntitlement,
       weeklyGuarantee:r.terms.weeklyGuarantee,appearanceFee:r.terms.appearanceFee,
       roleExpectation:r.terms.roleExpectation,creativeControl:r.terms.creativeControl,
       signingBonus:0})}))),current]);
  }
  if(charges.size)await tx.query(`UPDATE ppw_promotions p SET cash=p.cash-v.amount
   FROM jsonb_to_recordset($2::jsonb) AS v(promotion text,amount bigint)
   WHERE p.world_id=$1 AND p.promotion_id=v.promotion`,
   [input.worldId,JSON.stringify([...charges].map(([promotion,amount])=>({promotion,amount})))]);
  const accepted=decisions.filter(d=>d.status==="ACCEPTED");
  if(accepted.length)await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    SELECT $1,$2,$3,'CONTRACT_SIGNED',v.payload::jsonb
    FROM jsonb_to_recordset($4::jsonb) AS v(payload text)`,
    [input.worldId,clock[0]!.year,clock[0]!.week,JSON.stringify(accepted.map(d=>({
      payload:JSON.stringify({offerId:d.id,personId:input.personId,
      promotionId:rated.find(b=>b.offer_id===d.id)!.promotion_id,
      signingBonus:rated.find(b=>b.offer_id===d.id)!.terms.signingBonus})})))]);
  return {personId:input.personId,accepted:accepted.length,rejected:decisions.length-accepted.length,
   decisions};
 }});
}
