import type {SqlRows} from "./world-operations.js";
import {worldStaff} from "../domain/world-staff.js";
import {deriveRoadAgentReport} from "../domain/road-agent-report.js";
import type {CompletedShowReceipt} from "../domain/completed-show-receipt.js";
import type {RecordedMatchReportFact} from "./record-match-report-facts.js";
/** The World resolver stores one report in the same transaction as the show.
 * Future hiring and firing cannot rewrite this historical voice.
 */
export async function recordRoadAgentReport(tx:SqlRows,seed:string|number,
 receipt:CompletedShowReceipt,facts:readonly RecordedMatchReportFact[]){
 const members=await tx.query<{staff_id:string|null;legacy:boolean}>(`
  SELECT employee.staff_id,EXISTS(SELECT 1 FROM ppw_staff_legacy_identities legacy
   WHERE legacy.world_id=owner.world_id AND legacy.staff_id=employee.staff_id) AS legacy
  FROM ppw_promotion_controls owner
  LEFT JOIN LATERAL (
   SELECT staff_id FROM ppw_staff_employments e
   WHERE e.world_id=owner.world_id AND e.promotion_id=owner.promotion_id
    AND e.role='ROAD_AGENT' AND e.status='ACTIVE'
    AND e.start_week_index<=$3 AND e.expires_week_index>=$3
   LIMIT 1
  ) employee ON TRUE
  WHERE owner.world_id=$1 AND owner.promotion_id=$2 AND owner.active LIMIT 1`,
  [receipt.worldId,receipt.promotionId,(receipt.year-1)*52+receipt.week-1]);
 // AI-run promotions need neither staff prose nor another persisted result.
 if(!members.length)return;
 const agent=members[0]!.staff_id?
  worldStaff(seed,members[0]!.legacy?[members[0]!.staff_id!]:[]).find(s=>s.staffId===members[0]!.staff_id)??null:null;
 if(agent&&agent.role!=="ROAD_AGENT")throw new Error("Invalid employed Road Agent");
 const report=deriveRoadAgentReport(receipt,facts,agent);
 const inserted=await tx.query<{show_id:string}>(`
  INSERT INTO ppw_staff_show_reports
   (world_id,show_id,promotion_id,staff_id,reporter_name,analysis_json)
  VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING show_id`,
  [receipt.worldId,receipt.showId,receipt.promotionId,
   report.staffId,report.reporter,JSON.stringify(report)]);
 if(inserted.length!==1)throw new Error("Road Agent report was not persisted");
}
