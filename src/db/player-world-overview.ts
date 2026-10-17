import {withSqlClient} from "./postgres.js";
import type {TransactionPool} from "./transaction.js";

export interface PlayerWorldOverview {
 world:{id:string;name:string;year:number;week:number;day:number;
  phase:string;revision:number;nextLockEpoch:number;serverEpoch:number};
 membership:"ACTIVE"|"INACTIVE"|"NONE";
 promotion:null|{id:string;name:string;tier:string;cash:number;debt:number;
  lastWeeklyNet:number|null;runwayWeeks:number|null;financialDistress:string|null};
}

/** One World-keyed authenticated overview read instead of three round-trips.
 * Includes the server-authoritative next lock and measured server clock,
 * allowing a local iPhone countdown without database polling or drift.
 * There is no promotion leak for non-members or uncontrolled promotions.
 */
export async function readPlayerWorldOverview(
 pool:TransactionPool,worldId:string,playerId:string,
):Promise<PlayerWorldOverview|null>{
 if(![worldId,playerId].every(x=>typeof x==="string"&&x.trim()&&x.length<=200))
  throw new Error("Invalid World overview scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{
   world_id:string;world_name:string;year:number;week:number;day:number;
   phase:string;revision:string|number;next_lock_epoch:string;
   server_epoch:string;membership_status:"ACTIVE"|"INACTIVE"|null;
   promotion_id:string|null;promotion_name:string|null;tier:string|null;
   cash:string|number|null;debt:string|number|null;
   last_weekly_net:string|number|null;runway_weeks:number|null;
   financial_distress:string|null;
  }>(`
   SELECT w.world_id,w.name AS world_name,w.year,w.week,w.day,
    w.phase,w.revision,
    floor(extract(epoch FROM w.next_lock_at))::text AS next_lock_epoch,
    extract(epoch FROM clock_timestamp())::text AS server_epoch,
    m.status AS membership_status,
    owned.promotion_id,owned.name AS promotion_name,owned.tier,
    owned.cash,owned.debt,owned.last_weekly_net,
    owned.runway_weeks,owned.financial_distress
   FROM ppw_worlds w
   LEFT JOIN ppw_memberships m
    ON m.world_id=w.world_id AND m.player_id=$2
   LEFT JOIN LATERAL (
    SELECT p.promotion_id,p.name,p.tier,p.cash,p.debt,
     p.last_weekly_net,p.runway_weeks,p.financial_distress
    FROM ppw_promotion_controls c JOIN ppw_promotions p
     ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    WHERE c.world_id=w.world_id AND c.player_id=$2 AND c.active
     AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'
    ORDER BY p.promotion_id LIMIT 1
   ) owned ON TRUE
   WHERE w.world_id=$1`,[worldId,playerId]);
  if(!rows.length)return null;
  const x=rows[0]!;
  return {
   world:{id:x.world_id,name:x.world_name,
    year:x.year,week:x.week,day:x.day,phase:x.phase,
    revision:Number(x.revision),nextLockEpoch:Number(x.next_lock_epoch),
    serverEpoch:Number(x.server_epoch)},
   membership:x.membership_status??"NONE",
   promotion:x.promotion_id!==null?{
    id:x.promotion_id,name:x.promotion_name!,tier:x.tier!,
    cash:Number(x.cash),debt:Number(x.debt),
    lastWeeklyNet:x.last_weekly_net===null?null:Number(x.last_weekly_net),
    runwayWeeks:x.runway_weeks,financialDistress:x.financial_distress
   }:null
  };
 });
}
