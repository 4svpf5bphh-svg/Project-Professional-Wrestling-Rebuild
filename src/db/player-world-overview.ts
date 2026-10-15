import type { SqlRows } from "./world-operations.js";
import { withSqlClient } from "./postgres.js";
import type { TransactionPool } from "./transaction.js";

export interface PlayerWorldOverview {
  world: { id:string; name:string; year:number; week:number; day:number; phase:string; revision:number };
  membership: "ACTIVE" | "INACTIVE" | "NONE";
  promotion: null | { id:string; name:string; tier:string; cash:number; debt:number };
}

/** Three bounded indexed reads; never load the full World or all promotions.
 * API layer must validate the authenticated playerId before calling.
 */
export async function readPlayerWorldOverview(
  pool:TransactionPool, worldId:string, playerId:string,
):Promise<PlayerWorldOverview | null> {
  return withSqlClient(pool,async (tx:SqlRows)=>{
    const worlds=await tx.query<{
      world_id:string;name:string;year:number;week:number;day:number;phase:string;revision:string|number;
    }>("SELECT world_id,name,year,week,day,phase,revision FROM ppw_worlds WHERE world_id=$1",[worldId]);
    if (!worlds.length) return null;
    const w=worlds[0]!;
    const members=await tx.query<{status:"ACTIVE"|"INACTIVE"}>(
      "SELECT status FROM ppw_memberships WHERE world_id=$1 AND player_id=$2",[worldId,playerId]);
    const promotions=members[0]?.status==="ACTIVE" ? await tx.query<{
      promotion_id:string;name:string;tier:string;cash:string|number;debt:string|number;
    }>(
      "SELECT p.promotion_id,p.name,p.tier,p.cash,p.debt FROM ppw_promotion_controls c JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id WHERE c.world_id=$1 AND c.player_id=$2 AND c.active=true",
      [worldId,playerId],
    ) : [];
    const p=promotions[0];
    return {
      world:{id:w.world_id,name:w.name,year:w.year,week:w.week,day:w.day,phase:w.phase,revision:Number(w.revision)},
      membership:members[0]?.status ?? "NONE",
      promotion:p?{id:p.promotion_id,name:p.name,tier:p.tier,cash:Number(p.cash),debt:Number(p.debt)}:null,
    };
  });
}
