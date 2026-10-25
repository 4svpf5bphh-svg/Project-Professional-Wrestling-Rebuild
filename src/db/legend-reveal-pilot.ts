/** One-time, operator-only Undertaker reveal pilot. The operator identity comes
 * from verified server session and cannot be supplied by the browser.
 * This does NOT confer a contract, KP, or permission to skip World Lock.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {withWorldTransaction} from "./transaction.js";
type PilotStatus="ARMED"|"CONSUMED"|"CANCELLED";
export interface LegendPilotStatus{
 status:PilotStatus;promotionId:string;armedYear:number;armedWeek:number;
 consumedYear:number|null;consumedWeek:number|null;
}
export async function readLegendPilot(pool:TransactionPool,worldId:string):Promise<LegendPilotStatus|null>{
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{status:PilotStatus;promotion_id:string;armed_year:number;
   armed_week:number;consumed_year:number|null;consumed_week:number|null}>(`
   SELECT status,promotion_id,armed_year,armed_week,consumed_year,consumed_week
   FROM ppw_legend_reveal_pilots WHERE world_id=$1`,[worldId]);
  const r=rows[0];
  return r?{status:r.status,promotionId:r.promotion_id,armedYear:r.armed_year,
   armedWeek:r.armed_week,consumedYear:r.consumed_year,consumedWeek:r.consumed_week}:null;
 });
}
export async function armLegendPilot(pool:TransactionPool,worldId:string,operatorId:string){
 if(!worldId||!operatorId)throw new Error("Invalid operator session");
 return withWorldTransaction(pool,async tx=>{
  const worlds=await tx.query<{year:number;week:number;phase:string}>(`
   SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE`,[worldId]);
  const world=worlds[0];
  if(!world||world.phase!=="OPEN")throw new Error("Arm the pilot during an open booking week");
  const owns=await tx.query<{promotion_id:string}>(`
   SELECT c.promotion_id FROM ppw_promotion_controls c
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
    AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    AND p.lifecycle='ACTIVE'
   WHERE c.world_id=$1 AND c.player_id=$2 AND c.active
   ORDER BY c.promotion_id LIMIT 2`,[worldId,operatorId]);
  if(owns.length!==1)throw new Error("A single active operator promotion is required");
  const already=await tx.query<{legend_id:string}>(`
   SELECT legend_id FROM ppw_world_legend_unlocks
   WHERE world_id=$1 AND legend_id='undertaker'`,[worldId]);
  if(already.length)throw new Error("The Undertaker has already entered this World");
  const existing=await tx.query<{status:PilotStatus}>(`
   SELECT status FROM ppw_legend_reveal_pilots WHERE world_id=$1 FOR UPDATE`,[worldId]);
  if(existing[0]?.status==="CONSUMED")
   throw new Error("The one-time Undertaker reveal pilot has already been used");
  if(existing[0]?.status==="ARMED")
   throw new Error("The Undertaker pilot is already armed");
  await tx.query(`
   INSERT INTO ppw_legend_reveal_pilots(world_id,promotion_id,operator_player_id,
    armed_year,armed_week,status)
   VALUES($1,$2,$3,$4,$5,'ARMED')
   ON CONFLICT(world_id) DO UPDATE SET
    promotion_id=excluded.promotion_id,operator_player_id=excluded.operator_player_id,
    armed_year=excluded.armed_year,armed_week=excluded.armed_week,
    status='ARMED',consumed_year=NULL,consumed_week=NULL,armed_at=now()
   `,[worldId,owns[0]!.promotion_id,operatorId,world.year,world.week]);
  return {status:"ARMED" as const,promotionId:owns[0]!.promotion_id,
   armedYear:world.year,armedWeek:world.week};
 });
}
export async function cancelLegendPilot(pool:TransactionPool,worldId:string,operatorId:string){
 return withWorldTransaction(pool,async tx=>{
  const rows=await tx.query<{status:PilotStatus}>(`
   UPDATE ppw_legend_reveal_pilots SET status='CANCELLED'
   WHERE world_id=$1 AND operator_player_id=$2 AND status='ARMED'
   RETURNING status`,[worldId,operatorId]);
  if(rows.length!==1)throw new Error("There is no armed pilot to cancel");
  return {status:"CANCELLED" as const};
 });
}
