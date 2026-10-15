import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {applyWorldCommand} from "./world-commands.js";

export type ContinuityStatus =
  |"SUBMITTED_READY"|"SUBMITTED_REVIEW"|"PREPARED_DRAFT"
  |"STAFF_FALLBACK_ELIGIBLE"|"PLAYER_ACTION_REQUIRED"|"AI_MANAGED"|"UNASSIGNED";
export interface ContinuityAssessment {
  promotionId:string;showId:string|null;
  controllerPlayerId:string|null;status:ContinuityStatus;
}
type Candidate={
  promotion_id:string;management_mode:string;controller_player_id:string|null;
  delegated_player_id:string|null;allow_unfinished_fallback:boolean|null;
  draft_id:string|null;status:string|null;show_day:number|null;venue_id:string|null;
  slots:number|null;
};

/** Trusted week-scoped inspection during LOCKED or RESOLVING. Read-only and
 * batch bounded. No fictional staff show or absence penalty is inferred.
 */
export async function inspectWeekContinuity(tx:SqlRows,worldId:string){
  const world=await tx.query<{year:number;week:number;phase:string}>(
    "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId],
  );
  if(world.length!==1 || !["LOCKED","RESOLVING"].includes(world[0]!.phase))
    throw new Error("World must be locked before continuity assessment");
  const {year,week}=world[0]!;
  const rows=await tx.query<Candidate>(
    `SELECT p.promotion_id,p.management_mode,
         m.player_id AS controller_player_id,
         x.owner_player_id AS delegated_player_id,x.allow_unfinished_fallback,
         d.draft_id,d.status,d.show_day,d.venue_id,
         (SELECT count(*)::integer FROM ppw_card_slots s
           WHERE s.world_id=d.world_id AND s.draft_id=d.draft_id) AS slots
       FROM ppw_promotions p
       LEFT JOIN ppw_promotion_controls c ON c.world_id=p.world_id
         AND c.promotion_id=p.promotion_id AND c.active
       LEFT JOIN ppw_memberships m ON m.world_id=c.world_id
         AND m.player_id=c.player_id AND m.status='ACTIVE'
       LEFT JOIN ppw_staff_continuity_settings x ON x.world_id=p.world_id
         AND x.promotion_id=p.promotion_id
       LEFT JOIN LATERAL (
          SELECT draft_id,world_id,status,show_day,venue_id
            FROM ppw_booking_drafts
           WHERE world_id=p.world_id AND promotion_id=p.promotion_id
             AND year=$2 AND week=$3 AND status IN ('SUBMITTED','DRAFT')
           ORDER BY (status='SUBMITTED') DESC,revision DESC,draft_id ASC
           LIMIT 1
       ) d ON true
      WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
      ORDER BY p.promotion_id LIMIT 129`,
    [worldId,year,week],
  );
  if(rows.length>128)throw new Error("Too many active promotions for continuity assessment");
  const assessment:ContinuityAssessment[]=rows.map(r=>{
    const scheduleOk=r.show_day!==null&&r.show_day>=1&&r.show_day<=7&&
      typeof r.venue_id==="string"&&r.venue_id.trim().length>0;
    const hasCard=(r.slots??0)>0;
    let status:ContinuityStatus;
    if(r.status==="SUBMITTED") status=scheduleOk&&hasCard?"SUBMITTED_READY":"SUBMITTED_REVIEW";
    else if(r.status==="DRAFT"&&scheduleOk&&hasCard)status="PREPARED_DRAFT";
    else if(r.controller_player_id!==null &&
      r.delegated_player_id===r.controller_player_id && r.allow_unfinished_fallback===true)
      status="STAFF_FALLBACK_ELIGIBLE";
    else if(r.controller_player_id!==null)status="PLAYER_ACTION_REQUIRED";
    else if(r.management_mode==="AI")status="AI_MANAGED";
    else status="UNASSIGNED";
    return {promotionId:r.promotion_id,showId:r.draft_id,
      controllerPlayerId:r.controller_player_id,status};
  });
  return {year,week,assessment};
}
export interface RecordWeekContinuityInput {
  worldId:string;requestId:string;expectedRevision:number;
}
/** Trusted single World-lock checkpoint, NOT a second player deadline.
 * Persist only narrow outcomes (not complete card snapshot). Does not
 * advance the World or auto-submit/auto-generate any show.
 */
export async function recordWeekContinuity(pool:TransactionPool,input:RecordWeekContinuityInput){
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"RECORD_WEEK_CONTINUITY",
    execute:async tx=>{
      const state=await inspectWeekContinuity(tx,input.worldId);
      if(state.assessment.length===0)throw new Error("No active promotions to assess");
      const already=await tx.query<{count:string}>(
        "SELECT count(*)::text AS count FROM ppw_week_continuity_assessments WHERE world_id=$1 AND year=$2 AND week=$3",
        [input.worldId,state.year,state.week],
      );
      if(already.length!==1||Number(already[0]!.count)!==0)
        throw new Error("Week continuity already recorded");
      await tx.query(
        `INSERT INTO ppw_week_continuity_assessments
          (world_id,year,week,promotion_id,status,show_id,controller_player_id)
         SELECT $1,$2,$3,promotion_id,status,show_id,controller_player_id
           FROM unnest($4::text[],$5::text[],$6::text[],$7::text[])
             AS proposed(promotion_id,status,show_id,controller_player_id)`,
        [input.worldId,state.year,state.week,
         state.assessment.map(x=>x.promotionId),
         state.assessment.map(x=>x.status),
         state.assessment.map(x=>x.showId),
         state.assessment.map(x=>x.controllerPlayerId)],
      );
      const counts:Record<ContinuityStatus,number>={
        SUBMITTED_READY:0,SUBMITTED_REVIEW:0,PREPARED_DRAFT:0,
        STAFF_FALLBACK_ELIGIBLE:0,PLAYER_ACTION_REQUIRED:0,AI_MANAGED:0,UNASSIGNED:0,
      };
      for(const a of state.assessment)counts[a.status]++;
      return {year:state.year,week:state.week,total:state.assessment.length,counts};
    },
  });
}
