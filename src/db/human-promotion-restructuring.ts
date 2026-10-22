/** Original main lifecycle.ts's human-controlled restructuring option.
 * Explicitly reviewed by the authorised booker; NEVER automatic human
 * company foreclosure, reassignment or show-script alteration. This
 * operates under the existing shared World revision and open-week lock.
 */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import {ORIGINAL_ROSTER_TARGET,type PromotionTier} from "../domain/living-career.js";
export interface HumanRestructureScope{
 worldId:string;promotionId:string;playerId:string
}
export interface HumanRestructureInput extends HumanRestructureScope{
 requestId:string;expectedRevision:number
}
const valid=(x:string)=>typeof x==="string"&&x.length>0&&x.length<=200;
type RecordRow={revision:string|number;year:number;week:number;phase:string;
 tier:PromotionTier;distress:string|null;stress_weeks:number|null;
 last_restructure_week_index:number|null;restructuring_count:number|null;
 baseline_overhead:string|number|null;baseline_cadence:number|null;
 current_overhead:string|number|null;current_cadence:number|null;
 roster_count:number};
type Candidate={contract_id:string;person_id:string;name:string;
 weekly_guarantee:string|number;appearance_fee:string|number};
async function readPlan(tx:SqlRows,input:HumanRestructureScope){
 if(![input.worldId,input.promotionId,input.playerId].every(valid))
  throw new Error("Invalid management authority");
 const records=await tx.query<RecordRow>(`
 SELECT w.revision,w.year,w.week,w.phase,p.tier,
  p.financial_distress AS distress,s.stress_weeks,s.last_restructure_week_index,
  s.restructuring_count,s.baseline_weekly_fixed_overhead AS baseline_overhead,
  s.baseline_event_cadence_weeks AS baseline_cadence,
  p.weekly_fixed_overhead AS current_overhead,
  p.event_cadence_weeks AS current_cadence,
  (SELECT count(DISTINCT c.person_id)::integer
   FROM ppw_contracts c JOIN ppw_people person ON person.world_id=c.world_id
    AND person.person_id=c.person_id AND person.status<>'RETIRED'
   WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
    AND c.status='SIGNED' AND c.start_week_index<=(w.year-1)*52+w.week-1
    AND c.expires_week_index>=(w.year-1)*52+w.week-1) AS roster_count
 FROM ppw_worlds w
 JOIN ppw_promotion_controls controller ON controller.world_id=w.world_id
  AND controller.promotion_id=$2 AND controller.player_id=$3 AND controller.active
 JOIN ppw_memberships membership ON membership.world_id=w.world_id
  AND membership.player_id=controller.player_id AND membership.status='ACTIVE'
 JOIN ppw_promotions p ON p.world_id=w.world_id
  AND p.promotion_id=controller.promotion_id AND p.lifecycle='ACTIVE'
 LEFT JOIN ppw_promotion_survival s ON s.world_id=p.world_id
  AND s.promotion_id=p.promotion_id
 WHERE w.world_id=$1 LIMIT 1`,[input.worldId,input.promotionId,input.playerId]);
 if(records.length!==1)throw new Error("Only the active booker can restructure this promotion");
 const row=records[0]!,index=(row.year-1)*52+row.week-1;
 const due=(row.distress==="DISTRESSED"||row.distress==="CRISIS")&&
  row.phase==="OPEN"&&row.stress_weeks!==null&&row.stress_weeks>=8&&
  (row.last_restructure_week_index===null||
   index-row.last_restructure_week_index>=12)&&
  row.baseline_overhead!==null&&row.baseline_cadence!==null&&
  row.current_overhead!==null&&row.current_cadence!==null;
 if(!due)return null;
 const minimum=Math.max(6,Math.ceil(ORIGINAL_ROSTER_TARGET[row.tier]*.35));
 const releaseCount=Math.min(2,Math.max(0,row.roster_count-minimum));
 const candidates=releaseCount?await tx.query<Candidate>(`
 SELECT c.contract_id,c.person_id,person.name,c.weekly_guarantee,
  c.appearance_fee
 FROM ppw_contracts c JOIN ppw_people person ON person.world_id=c.world_id
  AND person.person_id=c.person_id
 WHERE c.world_id=$1 AND c.promotion_id=$2
  AND c.status='SIGNED' AND c.family<>'ONE_OFF'
  AND c.start_week_index<=$3 AND c.expires_week_index>=$3
 ORDER BY c.weekly_guarantee DESC,c.appearance_fee DESC,c.contract_id
 LIMIT 32`,[input.worldId,input.promotionId,index]):[];
 const seen=new Set<string>(),releases:{
  contractId:string;personId:string;name:string;settlement:number}[]=[];
 for(const c of candidates){
  if(releases.length>=releaseCount)break;
  if(seen.has(c.person_id))continue;
  seen.add(c.person_id);
  releases.push({contractId:c.contract_id,personId:c.person_id,name:c.name,
   settlement:Number(c.weekly_guarantee)*(row.distress==="CRISIS"?1:2)});
 }
 const overhead=Math.max(1,Math.round(Number(row.baseline_overhead)*
  (row.distress==="CRISIS"?.68:.84)));
 return {worldRevision:Number(row.revision),year:row.year,week:row.week,
  promotionId:input.promotionId,financialDistress:row.distress,
  stressWeeks:row.stress_weeks!,minimumViableRoster:minimum,
  currentRoster:row.roster_count,oldOverhead:Number(row.current_overhead),
  newOverhead:overhead,oldCadence:row.current_cadence!,
  newCadence:Math.min(4,row.baseline_cadence!+1),
  priorRestructures:row.restructuring_count!,releases};
}
export async function previewHumanPromotionRestructure(
 pool:TransactionPool,input:HumanRestructureScope){
 return withSqlClient(pool,async tx=>readPlan(tx,input));
}
export async function applyHumanPromotionRestructure(
 pool:TransactionPool,input:HumanRestructureInput){
 if(![input.worldId,input.promotionId,input.playerId].every(valid))
  throw new Error("Invalid human restructuring scope");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"HUMAN_PROMOTION_RESTRUCTURE",requiresOpenWeek:true,
  execute:async tx=>{
   const plan=await readPlan(tx,input);
   if(!plan)throw new Error("Restructuring is not due for this promotion");
   if(plan.worldRevision!==input.expectedRevision)
    throw new Error("Restructuring plan changed");
   const index=(plan.year-1)*52+plan.week-1;
   const updated=await tx.query<{promotion_id:string}>(`
    UPDATE ppw_promotions SET
     weekly_fixed_overhead=$3,event_cadence_weeks=$4
    WHERE world_id=$1 AND promotion_id=$2 AND lifecycle='ACTIVE'
    RETURNING promotion_id`,[input.worldId,input.promotionId,
    plan.newOverhead,plan.newCadence]);
   if(updated.length!==1)throw new Error("Promotion no longer available");
   const survival=await tx.query<{promotion_id:string}>(`
    UPDATE ppw_promotion_survival SET
     restructuring_count=restructuring_count+1,last_restructure_week_index=$3
    WHERE world_id=$1 AND promotion_id=$2
    RETURNING promotion_id`,[input.worldId,input.promotionId,index]);
   if(survival.length!==1)throw new Error("Original survival record not established");
   if(plan.releases.length){
    const terminated=await tx.query<{contract_id:string}>(`
     UPDATE ppw_contracts c SET status='TERMINATED',revision=revision+1
     FROM jsonb_to_recordset($3::jsonb) x(contract_id text)
     WHERE c.world_id=$1 AND c.promotion_id=$2
      AND c.contract_id=x.contract_id AND c.status='SIGNED'
     RETURNING c.contract_id`,[input.worldId,input.promotionId,JSON.stringify(
     plan.releases.map(x=>({contract_id:x.contractId})))]);
    if(terminated.length!==plan.releases.length)
     throw new Error("Talent list changed before restructuring");
    await tx.query(`
     UPDATE ppw_contract_renewal_proposals r SET status='WITHDRAWN'
     WHERE r.world_id=$1 AND r.promotion_id=$2
      AND r.contract_id=ANY($3::text[])
      AND r.status IN ('PENDING','ACCEPTED')`,
     [input.worldId,input.promotionId,plan.releases.map(x=>x.contractId)]);
    const total=plan.releases.reduce((sum,r)=>sum+r.settlement,0);
    await tx.query(`
     UPDATE ppw_promotions SET cash=cash-$3,
      last_weekly_net=coalesce(last_weekly_net,0)-$3
     WHERE world_id=$1 AND promotion_id=$2`,
     [input.worldId,input.promotionId,total]);
    await tx.query(`
     INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
     SELECT $1,$3,$4,'CONTRACT_TERMINATED_DURING_RESTRUCTURING',
      jsonb_build_object('promotionId',$5::text,'personId',x.person_id,
       'contractId',x.contract_id,'settlement',x.settlement,
       'significance','ROUTINE')
     FROM jsonb_to_recordset($2::jsonb) x(
      contract_id text,person_id text,settlement bigint)`,
     [input.worldId,JSON.stringify(plan.releases.map(x=>({
      contract_id:x.contractId,person_id:x.personId,settlement:x.settlement
     }))),plan.year,plan.week,input.promotionId]);
   }
   const withdrawn=await tx.query<{offer_id:string}>(`
    UPDATE ppw_contract_offers SET status='WITHDRAWN',
     rejection_reason='promotion restructuring'
    WHERE world_id=$1 AND promotion_id=$2 AND status='PENDING'
    RETURNING offer_id`,[input.worldId,input.promotionId]);
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'PROMOTION_RESTRUCTURED',
     jsonb_build_object('promotionId',$4::text,'overhead',$5::bigint,
     'cadenceWeeks',$6::integer,'releasedContracts',$7::integer,
     'withdrawnOffers',$8::integer,'restructuringCount',$9::integer,
     'significance',CASE WHEN $10::boolean THEN 'MAJOR' ELSE 'NOTABLE' END))`,
    [input.worldId,plan.year,plan.week,input.promotionId,plan.newOverhead,
     plan.newCadence,plan.releases.length,withdrawn.length,
     plan.priorRestructures+1,plan.financialDistress==="CRISIS"]);
   return {promotionId:input.promotionId,
    newOverhead:plan.newOverhead,newCadence:plan.newCadence,
    releasedContracts:plan.releases.length,withdrawnOffers:withdrawn.length,
    settlement:plan.releases.reduce((sum,r)=>sum+r.settlement,0)};
  }});
}
