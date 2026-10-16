import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";

export interface SetStaffContinuityInput {
  worldId:string;playerId:string;promotionId:string;
  requestId:string;expectedRevision:number;allowUnfinishedFallback:boolean;
  allowLogisticsFallback?:boolean;permittedDays?:number[];permittedVenueIds?:string[];
}
/** Player-authored BEFORE Lock; actor ID comes from verified middleware.
 * Staff cannot rewrite existing card scripts, negotiate or create authority
 * beyond this very narrow missing/incomplete show delegation.
 */
export async function setStaffContinuity(pool:TransactionPool,input:SetStaffContinuityInput){
  if(!input.promotionId||input.promotionId.length>200 ||
      typeof input.allowUnfinishedFallback!=="boolean")throw new Error("Invalid staff continuity setting");
  const days=input.permittedDays??[],venues=input.permittedVenueIds??[];
  if(input.allowLogisticsFallback!==undefined&&typeof input.allowLogisticsFallback!=="boolean"||
     days.length>7||new Set(days).size!==days.length||days.some(d=>!Number.isInteger(d)||d<1||d>7)||
     venues.length>32||new Set(venues).size!==venues.length||venues.some(v=>typeof v!=="string"||!v||v.length>200))
    throw new Error("Invalid logistics delegation");
  if(input.allowLogisticsFallback===true&&(!days.length||!venues.length))
    throw new Error("Logistics delegation requires allowed days and venues");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:input.playerId,
    requestId:input.requestId,expectedRevision:input.expectedRevision,
    commandType:"SET_STAFF_CONTINUITY",requiresOpenWeek:true,
    execute:async tx=>{
      const authorized=await tx.query<{promotion_id:string}>(
        `SELECT c.promotion_id FROM ppw_promotion_controls c
          JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
          JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
         WHERE c.world_id=$1 AND c.promotion_id=$2 AND c.player_id=$3
           AND c.active AND m.status='ACTIVE' AND p.lifecycle='ACTIVE'`,
        [input.worldId,input.promotionId,input.playerId],
      );
      if(authorized.length!==1)throw new Error("Only the active promotion controller may delegate staff continuity");
      await tx.query(
        `INSERT INTO ppw_staff_continuity_settings
           (world_id,promotion_id,owner_player_id,allow_unfinished_fallback,
            allow_logistics_fallback,permitted_days,permitted_venue_ids)
         VALUES($1,$2,$3,$4,$5,$6::smallint[],$7::text[])
         ON CONFLICT(world_id,promotion_id) DO UPDATE
           SET owner_player_id=EXCLUDED.owner_player_id,
               allow_unfinished_fallback=EXCLUDED.allow_unfinished_fallback,
               allow_logistics_fallback=EXCLUDED.allow_logistics_fallback,
               permitted_days=EXCLUDED.permitted_days,
               permitted_venue_ids=EXCLUDED.permitted_venue_ids`,
        [input.worldId,input.promotionId,input.playerId,input.allowUnfinishedFallback,
         input.allowLogisticsFallback??false,days,venues],
      );
      return {promotionId:input.promotionId,allowUnfinishedFallback:input.allowUnfinishedFallback,
        allowLogisticsFallback:input.allowLogisticsFallback??false};
    },
  });
}
