/** Manager decisions on existing staff alerts, with real simulation follow-through.
 * No freeform AI, invented workload changes or per-page state mutation.
 */
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";

export type StaffChoice="COMMIT"|"DEFER";
export type StaffReplyStatus="PENDING"|"ACKNOWLEDGED"|"KEPT"|"BROKEN"|"EXCUSED";
export interface StaffReplyInput {
 worldId:string;promotionId:string;playerId:string;mailId:string;
 decision:StaffChoice;requestId:string;expectedRevision:number;
}
export async function respondToStaffMail(pool:TransactionPool,i:StaffReplyInput){
 if(![i.worldId,i.promotionId,i.playerId,i.requestId].every(
   x=>typeof x==="string"&&!!x&&x.length<=200)||
  !/^backstage-world:[a-f0-9]{32}$/.test(i.mailId)||
  !["COMMIT","DEFER"].includes(i.decision))
  throw Error("Invalid staff response");
 return applyWorldCommand(pool,{worldId:i.worldId,playerId:i.playerId,
  requestId:i.requestId,expectedRevision:i.expectedRevision,
  commandType:"BACKSTAGE_STAFF_REPLY",requiresOpenWeek:true,
  execute:async tx=>{
   const sources=await tx.query<{
     employment_id:string;staff_id:string;role:"TALENT_MANAGER"|"MEDICAL"|"CREATIVE";now:number
   }>([
    "SELECT e.employment_id,e.staff_id,e.role,",
    "(w.year-1)*52+w.week-1 AS now",
    "FROM ppw_worlds w",
    "JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
    "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id",
    "AND m.player_id=c.player_id AND m.status='ACTIVE'",
    "JOIN ppw_promotions p ON p.world_id=c.world_id",
    "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
    "JOIN ppw_staff_employments e ON e.world_id=w.world_id",
    "AND e.promotion_id=c.promotion_id AND e.status='ACTIVE'",
    "AND e.role IN ('TALENT_MANAGER','MEDICAL','CREATIVE')",
    "AND e.start_week_index<=(w.year-1)*52+w.week-1",
    "AND e.expires_week_index>=(w.year-1)*52+w.week-1",
    "WHERE w.world_id=$1",
    "AND 'backstage-world:'||md5('staff:'||e.employment_id||':'||",
    "e.role||':'||floor(((w.year-1)*52+w.week-1)/4)::integer)=$4",
    "AND ((e.role='MEDICAL' AND EXISTS(",
    " SELECT 1 FROM ppw_contracts contract",
    " JOIN ppw_people person ON person.world_id=contract.world_id",
    " AND person.person_id=contract.person_id",
    " WHERE contract.world_id=w.world_id",
    " AND contract.promotion_id=c.promotion_id AND contract.status='SIGNED'",
    " AND contract.start_week_index<=(w.year-1)*52+w.week-1",
    " AND contract.expires_week_index>=(w.year-1)*52+w.week-1",
    " AND person.status IN ('ACTIVE','INJURED') AND person.fatigue>=70))",
    "OR (e.role='CREATIVE' AND EXISTS(",
    " SELECT 1 FROM ppw_programmes programme",
    " WHERE programme.world_id=w.world_id",
    " AND programme.promotion_id=c.promotion_id",
    " AND programme.status='ACTIVE' AND programme.repetition>=3))",
    "OR (e.role='TALENT_MANAGER' AND EXISTS(",
    " SELECT 1 FROM ppw_contracts contract",
    " WHERE contract.world_id=w.world_id AND contract.promotion_id=c.promotion_id",
    " AND contract.status='SIGNED' AND contract.family<>'ONE_OFF'",
    " AND contract.start_week_index<=(w.year-1)*52+w.week-1",
    " AND contract.expires_week_index BETWEEN",
    " (w.year-1)*52+w.week-1 AND (w.year-1)*52+w.week+3)",
    " AND NOT EXISTS(SELECT 1 FROM ppw_staff_continuity_settings setting",
    " WHERE setting.world_id=w.world_id AND setting.promotion_id=c.promotion_id",
    " AND setting.owner_player_id=$3 AND setting.auto_renew_same_terms=true)))",
    "LIMIT 2"
   ].join(" "),[i.worldId,i.promotionId,i.playerId,i.mailId]);
   if(sources.length!==1)throw Error("This staff concern is no longer actionable");
   const prior=await tx.query<{mail_id:string}>([
    "SELECT mail_id FROM ppw_backstage_staff_replies",
    "WHERE world_id=$1 AND promotion_id=$2 AND (mail_id=$3 OR (employment_id=$4 AND status='PENDING')) LIMIT 1"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,sources[0]!.employment_id]);
   if(prior.length)throw Error("This staff member already received your answer");
   const staff=sources[0]!,status:StaffReplyStatus=
    i.decision==="COMMIT"?"PENDING":"ACKNOWLEDGED";
   await tx.query([
    "INSERT INTO ppw_backstage_staff_replies(world_id,promotion_id,",
    "mail_id,employment_id,staff_id,role,player_id,decision,status,",
    "responded_week_index,due_week_index,settled_week_index)",
    "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)"
   ].join(" "),[i.worldId,i.promotionId,i.mailId,staff.employment_id,
    staff.staff_id,staff.role,i.playerId,i.decision,status,staff.now,
    staff.now+3,status==="ACKNOWLEDGED"?staff.now:null]);
   if(staff.role==="TALENT_MANAGER"&&i.decision==="COMMIT"){
    // Reuse the existing signed-by-owner continuity setting. This explicit
    // opt-in only changes auto-renewal consent; show/venue fallback and days
    // retain their previous authorisation (or default to false).
    await tx.query([
     "INSERT INTO ppw_staff_continuity_settings",
     "(world_id,promotion_id,owner_player_id,allow_unfinished_fallback,auto_renew_same_terms)",
     "VALUES($1,$2,$3,false,true)",
     "ON CONFLICT(world_id,promotion_id) DO UPDATE",
     // A transfer of control may NEVER inherit the former booker's show or
     // venue delegation. Preserve flags only for the SAME existing owner.
     "SET allow_unfinished_fallback=CASE",
     "WHEN ppw_staff_continuity_settings.owner_player_id<>EXCLUDED.owner_player_id",
     "THEN false ELSE ppw_staff_continuity_settings.allow_unfinished_fallback END,",
     "allow_logistics_fallback=CASE",
     "WHEN ppw_staff_continuity_settings.owner_player_id<>EXCLUDED.owner_player_id",
     "THEN false ELSE ppw_staff_continuity_settings.allow_logistics_fallback END,",
     "permitted_days=CASE",
     "WHEN ppw_staff_continuity_settings.owner_player_id<>EXCLUDED.owner_player_id",
     "THEN ARRAY[]::smallint[] ELSE ppw_staff_continuity_settings.permitted_days END,",
     "permitted_venue_ids=CASE",
     "WHEN ppw_staff_continuity_settings.owner_player_id<>EXCLUDED.owner_player_id",
     "THEN ARRAY[]::text[] ELSE ppw_staff_continuity_settings.permitted_venue_ids END,",
     "owner_player_id=EXCLUDED.owner_player_id,auto_renew_same_terms=true"
    ].join(" "),[i.worldId,i.promotionId,i.playerId]);
   }
   return {mailId:i.mailId,decision:i.decision,status,dueWeekIndex:staff.now+3};
  }});
}

/** Run after the already-established weekly fatigue and programme refresh,
 * once in the same certified World settlement transaction. One bounded SQL
 * statement changes the promise and the existing staff morale exactly once.
 */
export async function settleBackstageStaffPromises(tx:SqlRows,worldId:string,weekIndex:number){
 if(!worldId||worldId.length>200||!Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw Error("Invalid staff review week");
 const result=await tx.query<{settled:number}>([
  "WITH settled AS (",
  "UPDATE ppw_backstage_staff_replies r SET",
  "status=CASE WHEN e.status<>'ACTIVE' OR e.expires_week_index<$2",
  "THEN 'EXCUSED'",
  "WHEN r.role='MEDICAL' AND NOT EXISTS(",
  " SELECT 1 FROM ppw_contracts contract",
  " JOIN ppw_people person ON person.world_id=contract.world_id",
  " AND person.person_id=contract.person_id",
  " WHERE contract.world_id=r.world_id AND contract.promotion_id=r.promotion_id",
  " AND contract.status='SIGNED' AND contract.start_week_index<=$2",
  " AND contract.expires_week_index>=$2",
  " AND person.status IN ('ACTIVE','INJURED') AND person.fatigue>=70)",
  "THEN 'KEPT'",
  "WHEN r.role='CREATIVE' AND NOT EXISTS(",
  " SELECT 1 FROM ppw_programmes programme",
  " WHERE programme.world_id=r.world_id AND programme.promotion_id=r.promotion_id",
  " AND programme.status='ACTIVE' AND programme.repetition>=3)",
  "THEN 'KEPT'",
  "WHEN r.role='TALENT_MANAGER' AND EXISTS(",
  " SELECT 1 FROM ppw_contract_renewal_proposals proposal",
  " WHERE proposal.world_id=r.world_id",
  " AND proposal.promotion_id=r.promotion_id",
  " AND proposal.proposal_id LIKE 'staff-renew-%'",
  " AND proposal.created_week_index BETWEEN r.responded_week_index AND $2)",
  "THEN 'KEPT' ELSE 'BROKEN' END,settled_week_index=$2",
  "FROM ppw_staff_employments e",
  "WHERE r.world_id=$1 AND r.status='PENDING'",
  "AND r.responded_week_index<$2 AND e.world_id=r.world_id",
  "AND e.employment_id=r.employment_id",
  "AND (e.status<>'ACTIVE' OR e.expires_week_index<$2",
  "OR r.due_week_index<=$2",
  "OR (r.role='MEDICAL' AND NOT EXISTS(",
  " SELECT 1 FROM ppw_contracts c JOIN ppw_people p",
  " ON p.world_id=c.world_id AND p.person_id=c.person_id",
  " WHERE c.world_id=r.world_id AND c.promotion_id=r.promotion_id",
  " AND c.status='SIGNED' AND c.start_week_index<=$2",
  " AND c.expires_week_index>=$2",
  " AND p.status IN ('ACTIVE','INJURED') AND p.fatigue>=70))",
  "OR (r.role='CREATIVE' AND NOT EXISTS(",
  " SELECT 1 FROM ppw_programmes p WHERE p.world_id=r.world_id",
  " AND p.promotion_id=r.promotion_id AND p.status='ACTIVE'",
  " AND p.repetition>=3))",
  "OR (r.role='TALENT_MANAGER' AND EXISTS(",
  " SELECT 1 FROM ppw_contract_renewal_proposals proposal",
  " WHERE proposal.world_id=r.world_id",
  " AND proposal.promotion_id=r.promotion_id",
  " AND proposal.proposal_id LIKE 'staff-renew-%'",
  " AND proposal.created_week_index BETWEEN r.responded_week_index AND $2)))",
  "RETURNING r.employment_id,r.status",
  "), morale AS (",
  "UPDATE ppw_staff_employments e",
  "SET morale=greatest(0,least(100,e.morale+",
  " CASE s.status WHEN 'KEPT' THEN 2 WHEN 'BROKEN' THEN -2 ELSE 0 END))",
  "FROM settled s WHERE e.world_id=$1 AND e.employment_id=s.employment_id",
  "AND e.status='ACTIVE' RETURNING e.employment_id)",
  "SELECT count(*)::integer AS settled FROM settled"
 ].join(" "),[worldId,weekIndex]);
 return {settled:result[0]?.settled??0};
}
