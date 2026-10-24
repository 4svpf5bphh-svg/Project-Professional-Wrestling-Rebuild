import {randomUUID} from "node:crypto";
import type {TransactionPool} from "./transaction.js";
import {RINGSIDE_PROMPT_VERSION} from "../domain/ringside-editorial.js";
import {withWorldTransaction} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {DEFAULT_RINGSIDE_SETTINGS,validateRingsideSettings,
 type RingsideSettings} from "../domain/ringside-settings.js";
type DbRow={model:string;voice:string;detail:string;creativity:string|number;
 reasoning:string;additional_guidance:string;version:number};
const decode=(row:DbRow|undefined):RingsideSettings=>row?{
 model:row.model as RingsideSettings["model"],
 voice:row.voice as RingsideSettings["voice"],
 detail:row.detail as RingsideSettings["detail"],
 creativity:Number(row.creativity),reasoning:row.reasoning as RingsideSettings["reasoning"],
 additionalGuidance:row.additional_guidance,version:row.version
}:DEFAULT_RINGSIDE_SETTINGS;
export async function readAdminRingsideSettings(pool:TransactionPool,worldId:string){
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<DbRow>(`SELECT model,voice,detail,creativity,reasoning,
   additional_guidance,version FROM ppw_admin_ringside_settings
   WHERE world_id=$1`,[worldId]);return decode(rows[0]);
 });
}
export async function changeAdminRingsideSettings(pool:TransactionPool,
 worldId:string,playerId:string,value:unknown,expectedVersion:number){
 const settings=validateRingsideSettings(value);
 if(!worldId||!playerId||!Number.isSafeInteger(expectedVersion)||
   expectedVersion<0)throw new Error("Invalid Admin settings revision");
 return withWorldTransaction(pool,async tx=>{
  const prev=await tx.query<DbRow>(`SELECT model,voice,detail,creativity,reasoning,
   additional_guidance,version FROM ppw_admin_ringside_settings
   WHERE world_id=$1 FOR UPDATE`,[worldId]);
  if((prev[0]?.version??0)!==expectedVersion)
   throw new Error("Ringside settings changed. Reload Admin to review.");
  const rows=await tx.query<DbRow>(`
   INSERT INTO ppw_admin_ringside_settings
    (world_id,model,voice,detail,creativity,reasoning,additional_guidance,version,updated_by)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
   ON CONFLICT (world_id) DO UPDATE SET model=excluded.model,voice=excluded.voice,
    detail=excluded.detail,creativity=excluded.creativity,reasoning=excluded.reasoning,
    additional_guidance=excluded.additional_guidance,version=excluded.version,
    updated_by=excluded.updated_by,updated_at=now()
   WHERE ppw_admin_ringside_settings.version=$10
   RETURNING model,voice,detail,creativity,reasoning,additional_guidance,version`,
   [worldId,settings.model,settings.voice,settings.detail,settings.creativity,
    settings.reasoning,settings.additionalGuidance,expectedVersion+1,playerId,expectedVersion]);
  if(rows.length!==1)throw new Error("Ringside settings changed. Reload Admin to review.");
  await tx.query(`INSERT INTO ppw_admin_action_audit
   (world_id,event_id,player_id,action,context_json)
   VALUES($1,$2,$3,'RINGSIDE_SETTINGS_UPDATED',$4::jsonb)`,
   [worldId,randomUUID(),playerId,JSON.stringify({version:expectedVersion+1,
    model:settings.model,voice:settings.voice,detail:settings.detail,
    creativity:settings.creativity,reasoning:settings.reasoning})]);
  return decode(rows[0]);
 });
}

// A failed AI article is NOT a recorded match result. An explicit designated
// operator action can re-arm an exhausted FAILED report; ready editorial is
// immutable. One retry per show per day, enforced by indexed audit history.
export async function rearmFailedRingsideReport(pool:TransactionPool,
 worldId:string,playerId:string,showId:string){
 if(!worldId||!playerId||!showId||showId.length>200)
  throw new Error("Select one completed player-controlled show.");
 return withWorldTransaction(pool,async tx=>{
  await tx.query("SELECT world_id FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId]);
  const rows=await tx.query<{state:string;attempts:number}>(`
   SELECT r.state,r.attempts
   FROM ppw_completed_shows c
   JOIN ppw_promotion_controls p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id AND p.player_id=$2 AND p.active
   JOIN ppw_memberships m ON m.world_id=p.world_id AND m.player_id=p.player_id
    AND m.status='ACTIVE'
   LEFT JOIN ppw_ringside_reports r ON r.world_id=c.world_id
    AND r.promotion_id=c.promotion_id AND r.show_id=c.show_id
    AND r.prompt_version=$4
   WHERE c.world_id=$1 AND c.show_id=$3 LIMIT 1`,
   [worldId,playerId,showId,RINGSIDE_PROMPT_VERSION]);
  if(rows.length!==1)throw new Error("This is not one of your completed shows.");
  if(rows[0]?.state==="READY")
   throw new Error("This show already has a published AI report. It will not be rewritten.");
  if(rows[0]?.state!=="FAILED"||rows[0]?.attempts!==2)
   throw new Error("This report has not exhausted its automatic generation attempts.");
  const recent=await tx.query<{event_id:string}>(`
   SELECT event_id FROM ppw_admin_action_audit
   WHERE world_id=$1 AND action='RINGSIDE_FAILED_RETRY' AND
    context_json->>'showId'=$2 AND created_at>now()-interval '24 hours'
   LIMIT 1`,[worldId,showId]);
  if(recent.length)throw new Error("This show already received an Admin retry in the last 24 hours.");
  const deleted=await tx.query<{show_id:string}>(`
   DELETE FROM ppw_ringside_reports
   WHERE world_id=$1 AND show_id=$2 AND prompt_version=$3
    AND state='FAILED' AND attempts=2 RETURNING show_id`,
   [worldId,showId,RINGSIDE_PROMPT_VERSION]);
  if(deleted.length!==1)throw new Error("The AI report changed. Refresh Admin.");
  await tx.query(`INSERT INTO ppw_admin_action_audit
   (world_id,event_id,player_id,action,context_json)
   VALUES($1,$2,$3,'RINGSIDE_FAILED_RETRY',$4::jsonb)`,
   [worldId,randomUUID(),playerId,JSON.stringify({showId})]);
  return {status:"ARMED",showId};
 });
}
