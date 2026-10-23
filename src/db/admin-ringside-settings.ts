import {randomUUID} from "node:crypto";
import type {TransactionPool} from "./transaction.js";
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
   RETURNING model,voice,detail,creativity,reasoning,additional_guidance,version`,
   [worldId,settings.model,settings.voice,settings.detail,settings.creativity,
    settings.reasoning,settings.additionalGuidance,expectedVersion+1,playerId]);
  await tx.query(`INSERT INTO ppw_admin_action_audit
   (world_id,event_id,player_id,action,context_json)
   VALUES($1,$2,$3,'RINGSIDE_SETTINGS_UPDATED',$4::jsonb)`,
   [worldId,randomUUID(),playerId,JSON.stringify({version:expectedVersion+1,
    model:settings.model,voice:settings.voice,detail:settings.detail,
    creativity:settings.creativity,reasoning:settings.reasoning})]);
  return decode(rows[0]);
 });
}
