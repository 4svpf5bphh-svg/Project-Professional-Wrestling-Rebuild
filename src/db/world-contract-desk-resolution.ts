/** End-of-week human negotiation answers, reusing existing trusted
 * single-person/offering commands and their idempotent receipts.
 * Only discovers pending IDs, never reads the entire World aggregate.
 * Work is resumable at each completed command if the resolver is interrupted.
 */
import {createHash} from "node:crypto";
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {resolvePersonContractOffers} from "./manual-contract-offers.js";
import {resolveRenewal} from "./resolve-contract-renewal.js";
import {resolveDateRequest} from "./contract-date-decisions.js";

export interface ContractDeskSettlementInput {
 worldId:string;year:number;week:number;resolutionId:string;
}
function receiptKey(input:ContractDeskSettlementInput,kind:string,id:string):string{
 return "desk:"+createHash("sha256").update(JSON.stringify([
  input.worldId,input.year,input.week,input.resolutionId,kind,id,
 ])).digest("hex");
}
export async function settlePendingWorldContracts(pool:TransactionPool,input:ContractDeskSettlementInput){
 if(!input.worldId||!input.resolutionId||!Number.isSafeInteger(input.year)||input.year<1||
 !Number.isSafeInteger(input.week)||input.week<1||input.week>52)
  throw new Error("Invalid contract settlement scope");
 const snapshot=await withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{revision:string|number;phase:string;year:number;week:number}>(`
   SELECT revision,phase,year,week FROM ppw_worlds WHERE world_id=$1 FOR UPDATE`,[input.worldId]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING"||world[0]!.year!==input.year||
    world[0]!.week!==input.week)throw new Error("World changed during contract settlement");
  const current=(input.year-1)*52+input.week-1;
  const people=await tx.query<{person_id:string}>(`
   SELECT DISTINCT person_id FROM ppw_contract_offers
   WHERE world_id=$1 AND status='PENDING' AND submitted_week_index<=$2
   ORDER BY person_id LIMIT 201`,[input.worldId,current]);
  const renewals=await tx.query<{proposal_id:string;promotion_id:string}>(`
   SELECT proposal_id,promotion_id FROM ppw_contract_renewal_proposals
   WHERE world_id=$1 AND status='PENDING' AND created_week_index<=$2
   ORDER BY proposal_id LIMIT 201`,[input.worldId,current]);
  const dates=await tx.query<{request_id:string;promotion_id:string}>(`
   SELECT request_id,promotion_id FROM ppw_contract_date_requests
   WHERE world_id=$1 AND status='PENDING' AND created_week_index<=$2
   ORDER BY request_id LIMIT 201`,[input.worldId,current]);
  if(people.length>200||renewals.length>200||dates.length>200)
   throw new Error("Contract settlement work exceeds bounded weekly capacity");
  const revision=Number(world[0]!.revision);
  if(!Number.isSafeInteger(revision))throw new Error("Invalid World revision");
  return {revision,people,renewals,dates};
 });
 let revision=snapshot.revision,answered=0,accepted=0,rejected=0;
 const check=(result:{status:"APPLIED"|"REPLAYED"|"STALE";revision:number;result?:unknown})=>{
  if(result.status==="STALE")throw new Error("World revision changed during contract settlement");
  revision=result.revision;
  answered++;
 };
 const authority={source:"WORLD_RESOLUTION" as const,worldId:input.worldId};
 for(const p of snapshot.people){
  const result=await resolvePersonContractOffers(pool,{
   worldId:input.worldId,personId:p.person_id,
   requestId:receiptKey(input,"offer",p.person_id),expectedRevision:revision,
  },authority);
  check(result);
  if(result.status!=="STALE"){accepted+=result.result.accepted;rejected+=result.result.rejected;}
 }
 for(const p of snapshot.renewals){
  const result=await resolveRenewal(pool,{
   worldId:input.worldId,playerId:"system",promotionId:p.promotion_id,
   proposalId:p.proposal_id,decision:"ACCEPTED",
   requestId:receiptKey(input,"renewal",p.proposal_id),expectedRevision:revision,
  },authority);
  check(result);
  if(result.status!=="STALE"){
   if(result.result.decision==="ACCEPTED")accepted++;else rejected++;
  }
 }
 for(const d of snapshot.dates){
  const result=await resolveDateRequest(pool,{
   worldId:input.worldId,playerId:"system",promotionId:d.promotion_id,
   dateRequestId:d.request_id,decision:"ACCEPTED",
   requestId:receiptKey(input,"dates",d.request_id),expectedRevision:revision,
  },authority);
  check(result);
  if(result.status!=="STALE"){
   if(result.result.decision==="ACCEPTED")accepted++;else rejected++;
  }
 }
 // Catch any offers arriving while commands ran, or incomplete work. The
 // World is RESOLVING so players cannot submit new ones during this stage.
 const pending=await withWorldTransaction(pool,async tx=>{
  const results=await tx.query<{count:number}>(`
   SELECT (
     (SELECT count(*) FROM ppw_contract_offers WHERE world_id=$1 AND status='PENDING')
     +(SELECT count(*) FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND status='PENDING')
     +(SELECT count(*) FROM ppw_contract_date_requests WHERE world_id=$1 AND status='PENDING')
   )::integer AS count`,[input.worldId]);
  return results[0]!.count;
 });
 if(pending!==0)throw new Error("Pending contract negotiations remain unresolved");
 return {answered,accepted,rejected,revision};
}
