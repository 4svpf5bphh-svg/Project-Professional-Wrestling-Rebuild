import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";

export interface SetStaffContinuityInput {
  worldId:string;playerId:string;promotionId:string;
  requestId:string;expectedRevision:number;allowUnfinishedFallback:boolean;
  allowLogisticsFallback?:boolean;permittedDays?:number[];permittedVenueIds?:string[];
  autoRenewSameTerms?:boolean;
}
/** Player-authored BEFORE Lock; actor ID comes from verified middleware.
 * Staff cannot rewrite existing card scripts, negotiate or create authority
 * beyond this very narrow missing/incomplete show delegation.
 */
export async function setStaffContinuity(pool:TransactionPool,input:SetStaffContinuityInput){
  if(!input.promotionId||input.promotionId.length>200 ||
      typeof input.allowUnfinishedFallback!=="boolean")throw new Error("Invalid staff continuity setting");
  if(input.autoRenewSameTerms!==undefined&&typeof input.autoRenewSameTerms!=="boolean")
   throw new Error("Invalid Talent Manager consent");
  const days=input.permittedDays??[],venues=input.permittedVenueIds??[];
  const changeLogistics=input.allowLogisticsFallback!==undefined||input.permittedDays!==undefined||input.permittedVenueIds!==undefined;
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
      if(input.autoRenewSameTerms===true){
        const employed=await tx.query<{employment_id:string}>([
          "SELECT employment_id FROM ppw_staff_employments",
          "WHERE world_id=$1 AND promotion_id=$2 AND status='ACTIVE' LIMIT 1"
        ].join(" "),[input.worldId,input.promotionId]);
        if(employed.length!==1)throw new Error("Hire a Talent Manager before enabling delegated renewals");
      }
      await tx.query(
        `INSERT INTO ppw_staff_continuity_settings
           (world_id,promotion_id,owner_player_id,allow_unfinished_fallback,
            allow_logistics_fallback,permitted_days,permitted_venue_ids,
            auto_renew_same_terms)
         VALUES($1,$2,$3,$4,$5,$6::smallint[],$7::text[],$9)
         ON CONFLICT(world_id,promotion_id) DO UPDATE
           SET owner_player_id=EXCLUDED.owner_player_id,
               allow_unfinished_fallback=EXCLUDED.allow_unfinished_fallback,
               allow_logistics_fallback=CASE WHEN $8::boolean THEN EXCLUDED.allow_logistics_fallback ELSE ppw_staff_continuity_settings.allow_logistics_fallback END,
               permitted_days=CASE WHEN $8::boolean THEN EXCLUDED.permitted_days ELSE ppw_staff_continuity_settings.permitted_days END,
               permitted_venue_ids=CASE WHEN $8::boolean THEN EXCLUDED.permitted_venue_ids ELSE ppw_staff_continuity_settings.permitted_venue_ids END,
               auto_renew_same_terms=CASE
                 WHEN ppw_staff_continuity_settings.owner_player_id<>EXCLUDED.owner_player_id
                  THEN EXCLUDED.auto_renew_same_terms
                 WHEN $10::boolean THEN EXCLUDED.auto_renew_same_terms
                 ELSE ppw_staff_continuity_settings.auto_renew_same_terms END`,
        [input.worldId,input.promotionId,input.playerId,input.allowUnfinishedFallback,
         input.allowLogisticsFallback??false,days,venues,changeLogistics,
         input.autoRenewSameTerms??false,input.autoRenewSameTerms!==undefined],
      );
      return {promotionId:input.promotionId,allowUnfinishedFallback:input.allowUnfinishedFallback};
    },
  });
}
