/** The public Industry sheet: one World clock, standings and only finished
 * broadcasts. Unsubmitted rival card details, finances and negotiations stay
 * private. All three reads are bounded; no giant WorldState or background poll.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
export async function readIndustryWorldHub(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=input;
 if(![worldId,promotionId,playerId].every(s=>typeof s==="string"&&
  s.length>0&&s.length<=200))throw new Error("Invalid Industry viewer");
 return withSqlClient(pool,async tx=>{
  const clocks=await tx.query<{year:number;week:number;phase:string;
   next_lock_epoch:string;world_name:string;own_name:string}>(`
   SELECT w.year,w.week,w.phase,
     floor(extract(epoch FROM w.next_lock_at))::text AS next_lock_epoch,
     w.name AS world_name,owned.name AS own_name
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.promotion_id=$3 AND c.player_id=$2
    AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=$2
    AND m.status='ACTIVE'
   JOIN ppw_promotions owned ON owned.world_id=w.world_id
    AND owned.promotion_id=$3 AND owned.lifecycle='ACTIVE'
   WHERE w.world_id=$1`,[worldId,playerId,promotionId]);
  if(clocks.length!==1)throw new Error("Industry access denied");
  const clock=clocks[0]!,now=(clock.year-1)*52+clock.week-1;
  const companies=await tx.query<{promotion_id:string;name:string;
   tier:string;media_reach:number|null;financial_distress:string|null;
   latest_show_week:number|null;recent_avg_crowd:string|null;
   completed_events:number;management_mode:string}>(`
   WITH recent AS (
     SELECT p.promotion_id,max((c.year-1)*52+c.week-1) AS latest_show_week,
      avg(c.crowd_response)::numeric(6,1)::text AS recent_avg_crowd,
      count(*)::integer AS completed_events
     FROM ppw_promotions p JOIN ppw_completed_shows c
      ON c.world_id=p.world_id AND c.promotion_id=p.promotion_id
      AND (c.year-1)*52+c.week-1 BETWEEN $2::integer-12 AND $2::integer
     WHERE p.world_id=$1 GROUP BY p.promotion_id
   )
   SELECT p.promotion_id,p.name,p.tier,p.media_reach,
    p.financial_distress,p.management_mode,r.latest_show_week,
    r.recent_avg_crowd,coalesce(r.completed_events,0) AS completed_events
   FROM ppw_promotions p LEFT JOIN recent r ON r.promotion_id=p.promotion_id
   WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
   ORDER BY p.media_reach DESC NULLS LAST,p.name ASC,p.promotion_id ASC
   LIMIT 129`,[worldId,now]);
  if(companies.length>128)throw new Error("Industry company bound exceeded");
  const broadcasts=await tx.query<{show_id:string;promotion_id:string;
   promotion_name:string;show_name:string|null;booking_class:string;
   year:number;week:number;crowd_response:string|number;
   show_day:number|null}>(`
   SELECT c.show_id,c.promotion_id,p.name AS promotion_name,
    d.show_name,d.booking_class,c.year,c.week,
    c.crowd_response,d.show_day
   FROM ppw_completed_shows c
   JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id
   JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id
   WHERE c.world_id=$1 AND p.lifecycle='ACTIVE'
    AND (c.year-1)*52+c.week-1 BETWEEN $2::integer-12 AND $2::integer
   ORDER BY c.year DESC,c.week DESC,c.show_day DESC NULLS LAST,
    c.show_id DESC LIMIT 25`,[worldId,now]);
  return {worldName:clock.world_name,year:clock.year,week:clock.week,
   phase:clock.phase,nextLockEpoch:Number(clock.next_lock_epoch),
   ownPromotionId:promotionId,ownPromotionName:clock.own_name,
   promotions:companies.map((p,i)=>({
    promotionId:p.promotion_id,name:p.name,tier:p.tier,
    rank:i+1,mediaReach:p.media_reach,
    financialDistress:p.financial_distress,managementMode:p.management_mode,
    latestCompletedWeekIndex:p.latest_show_week,
    recentAverageCrowd:p.recent_avg_crowd===null?null:Number(p.recent_avg_crowd),
    recentShowCount:p.completed_events,
    isYours:p.promotion_id===promotionId
   })),
   broadcasts:broadcasts.map(s=>({
    showId:s.show_id,promotionId:s.promotion_id,
    promotionName:s.promotion_name,
    showName:s.show_name??(s.booking_class==="PREMIUM"?"Premium event":"Weekly show"),
    bookingClass:s.booking_class,year:s.year,week:s.week,
    day:s.show_day,crowdResponse:Number(s.crowd_response),
    isYours:s.promotion_id===promotionId
   }))
  };
 });
}
