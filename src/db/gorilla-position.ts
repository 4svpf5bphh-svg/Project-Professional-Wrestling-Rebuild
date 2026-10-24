/** One bounded controller-scoped policy read, and an immutable resolution log.
 * Only the trusted canonical resolver may insert show logs.
 */
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {worldStaff} from "../domain/world-staff.js";
import {GORILLA_POLICIES,planGorillaPosition,
 type GorillaPolicy,type GorillaShowLog,type GorillaAgent} from "../domain/gorilla-position.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
import type {RecordedMatchReportFact} from "./record-match-report-facts.js";
import type {GorillaMatchInstruction} from "../domain/gorilla-position.js";
export interface GorillaPolicyInput{
 worldId:string;promotionId:string;playerId:string;requestId:string;
 expectedRevision:number;policy:GorillaPolicy;
}
export async function setGorillaPolicy(pool:TransactionPool,input:GorillaPolicyInput){
 if(!GORILLA_POLICIES.includes(input.policy)||
  ![input.worldId,input.promotionId,input.playerId].every(s=>
   typeof s==="string"&&s.length>0&&s.length<=200))
  throw new Error("Invalid Gorilla instructions");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,commandType:"SET_GORILLA_POLICY",
  requiresOpenWeek:true,execute:async tx=>{
   const rows=await tx.query<{week_index:number}>(`
    SELECT (w.year-1)*52+w.week-1 AS week_index
    FROM ppw_worlds w JOIN ppw_promotion_controls c
     ON c.world_id=w.world_id AND c.player_id=$2
      AND c.promotion_id=$3 AND c.active
    JOIN ppw_memberships m ON m.world_id=c.world_id
     AND m.player_id=c.player_id AND m.status='ACTIVE'
    JOIN ppw_promotions p ON p.world_id=c.world_id
     AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
    WHERE w.world_id=$1`,[input.worldId,input.playerId,input.promotionId]);
   if(rows.length!==1)throw new Error("Only the active promotion controller may direct Gorilla Position");
   await tx.query(`
    INSERT INTO ppw_gorilla_policies
     (world_id,promotion_id,owner_player_id,policy,updated_week_index)
    VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(world_id,promotion_id) DO UPDATE
     SET owner_player_id=EXCLUDED.owner_player_id,
      policy=EXCLUDED.policy,updated_week_index=EXCLUDED.updated_week_index`,
    [input.worldId,input.promotionId,input.playerId,input.policy,rows[0]!.week_index]);
   return {policy:input.policy,promotionId:input.promotionId};
  }
 });
}
export async function calculateGorillaShow(
 tx:SqlRows,seed:string|number,receipt:CompletedShowReceipt,
 facts:readonly RecordedMatchReportFact[],
):Promise<GorillaShowLog|null>{
 // The active controller, not any anonymous visitor, owns this log. AI
 // promotions have no policy and produce no costly extra narrative.
 const rows=await tx.query<{policy:GorillaPolicy|null;player_id:string;
  staff_id:string|null;legacy:boolean}>(`
   SELECT c.player_id,instruction.policy,employee.staff_id,
    employee.staff_id IS NOT NULL AND EXISTS(
     SELECT 1 FROM ppw_staff_legacy_identities legacy
     WHERE legacy.world_id=c.world_id
      AND legacy.staff_id=employee.staff_id) AS legacy
   FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'
   LEFT JOIN ppw_gorilla_policies instruction
    ON instruction.world_id=c.world_id AND instruction.promotion_id=c.promotion_id
     AND instruction.owner_player_id=c.player_id
   LEFT JOIN LATERAL (
    SELECT e.staff_id FROM ppw_staff_employments e
    WHERE e.world_id=c.world_id AND e.promotion_id=c.promotion_id
     AND e.role='ROAD_AGENT' AND e.status='ACTIVE'
     AND e.start_week_index <= $3 AND e.expires_week_index >= $3
    LIMIT 1
   ) employee ON TRUE
   WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.active`,
   [receipt.worldId,receipt.promotionId,(receipt.year-1)*52+receipt.week-1]);
 if(!rows.length)return null;
 if(rows.length!==1)throw new Error("Multiple Gorilla controllers for one show");
 const row=rows[0]!;
 const staff=row.staff_id?
  worldStaff(seed,row.legacy?[row.staff_id]:[]).find(x=>x.staffId===row.staff_id):null;
 if(row.staff_id&&(!staff||staff.role!=="ROAD_AGENT"))
  throw new Error("Unrecognized Gorilla Road Agent");
 const agent:GorillaAgent|null=staff?{
  staffId:staff.staffId,name:staff.name,craft:staff.craft,
  people:staff.people,reliability:staff.reliability}:null;
 const approved=await tx.query<{slot_id:string;protect_script:boolean;
  crowd_choice:GorillaMatchInstruction["crowdChoice"];
  timing_choice:GorillaMatchInstruction["timingChoice"]}>(`
  SELECT g.slot_id,g.protect_script,g.crowd_choice,g.timing_choice
  FROM ppw_gorilla_match_instructions g
  JOIN ppw_card_slots s ON s.world_id=g.world_id AND s.draft_id=g.show_id
   AND s.slot_id=g.slot_id AND s.kind='MATCH'
  WHERE g.world_id=$1 AND g.show_id=$2 AND g.promotion_id=$3
   AND g.owner_player_id=$4 AND g.slot_signature=md5(s.payload::text)
  ORDER BY g.slot_id LIMIT 101`,
  [receipt.worldId,receipt.showId,receipt.promotionId,row.player_id]);
 if(approved.length>100)throw new Error("Gorilla match instruction capacity exceeded");
 return planGorillaPosition(receipt,facts,row.policy??"STICK_TO_CARD",agent,
  approved.map(x=>({matchId:x.slot_id,protectScript:x.protect_script,
   crowdChoice:x.crowd_choice,timingChoice:x.timing_choice})));
}
export async function recordGorillaShow(tx:SqlRows,receipt:CompletedShowReceipt,log:GorillaShowLog){
 if(receipt.crowdResponse!==log.crowdAfter)
  throw new Error("Gorilla log does not match the certified show crowd");
 const saved=await tx.query<{show_id:string}>(`
  INSERT INTO ppw_gorilla_show_logs
   (world_id,show_id,promotion_id,policy,staff_id,staff_name,log_json)
  VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING show_id`,
  [receipt.worldId,receipt.showId,receipt.promotionId,log.policy,
   log.staffId,log.staffName,JSON.stringify(log)]);
 if(saved.length!==1)throw new Error("Gorilla show log not persisted");
}
