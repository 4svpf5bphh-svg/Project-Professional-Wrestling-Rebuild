/** Staff permissions belong to the active human controller. A single
 * private current-week snapshot, never World-wide roster or ledger hydration.
 * Configured permissions are not an instruction to change authored results.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export async function readStaffWorkspace(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=input;
 if(![worldId,promotionId,playerId].every(s=>typeof s==="string"&&
  s.length>0&&s.length<=200))throw new Error("Invalid Staff desk request");
 return withSqlClient(pool,async tx=>{
  const owners=await tx.query<{
   year:number;week:number;revision:string|number;
   can_edit:boolean;allow_unfinished_fallback:boolean|null;
   allow_logistics_fallback:boolean|null;
   permitted_days:number[]|null;permitted_venue_ids:string[]|null;
   frozen_logistics:boolean|null;
  }>(`
   SELECT w.year,w.week,w.revision,
    (w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS can_edit,
    s.allow_unfinished_fallback,s.allow_logistics_fallback,
    s.permitted_days,s.permitted_venue_ids,
    l.allow_logistics_fallback AS frozen_logistics
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
    AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id
    AND p.lifecycle='ACTIVE'
   LEFT JOIN ppw_staff_continuity_settings s ON s.world_id=w.world_id
    AND s.promotion_id=$3 AND s.owner_player_id=$2
   LEFT JOIN ppw_week_logistics_authorizations l
    ON l.world_id=w.world_id AND l.year=w.year AND l.week=w.week
    AND l.promotion_id=$3 AND l.controller_player_id=$2
   WHERE w.world_id=$1`,[worldId,playerId,promotionId]);
  if(owners.length!==1)throw new Error("Staff desk access denied");
  const current=owners[0]!;
  const venues=await tx.query<{venue_id:string;name:string;
   capacity:number|null;weekly_hire_cost:string|null}>(`
   SELECT venue_id,name,capacity,weekly_hire_cost::text
    FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE'
    ORDER BY name,venue_id LIMIT 129`,[worldId]);
  if(venues.length>128)throw new Error("Venue catalogue exceeds staff configuration limit");
  return {year:current.year,week:current.week,
   worldRevision:Number(current.revision),canEdit:current.can_edit,
   allowUnfinishedFallback:current.allow_unfinished_fallback===true,
   allowLogisticsFallback:current.allow_logistics_fallback===true,
   permittedDays:current.permitted_days??[],
   permittedVenueIds:current.permitted_venue_ids??[],
   lockedLogisticsDelegated:current.frozen_logistics===true,
   venues:venues.map(v=>({venueId:v.venue_id,name:v.name,
    capacity:v.capacity,weeklyHireCost:v.weekly_hire_cost===null?
     null:Number(v.weekly_hire_cost)}))};
 });
}
