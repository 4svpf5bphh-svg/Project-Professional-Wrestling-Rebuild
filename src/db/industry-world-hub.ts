/** The public Industry sheet: one World clock, standings and only finished
 * broadcasts. Unsubmitted rival card details, finances and negotiations stay
 * private. All three reads are bounded; no giant WorldState or background poll.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {effectiveWrestlerAlignment} from "../domain/original-alignment.js";
import {aiPromotionIdentity,AI_IDENTITY_LABELS} from "../domain/ai-promotion-strategy.js";
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
  const cutoff=Math.max(0,now-12);
  const lowerYear=Math.floor(cutoff/52)+1,lowerWeek=cutoff%52+1;
  // The existing (world_id,year,week,promotion_id) index can perform a
  // 13-week range scan even after decades of history. Avoid arithmetic
  // on c.year/c.week inside WHERE, which would scan the whole archive.
  const window=[worldId,lowerYear,lowerWeek,clock.year,clock.week];
  const companies=await tx.query<{promotion_id:string;name:string;
   tier:string;media_reach:number|null;
   latest_show_week:number|null;recent_avg_crowd:string|null;
   completed_events:number;management_mode:string;human_managed:boolean;
   ai_risk_tolerance:number|null;ai_match_quality_preference:number|null;
   ai_star_preference:number|null}>(`
   WITH recent AS (
     SELECT c.promotion_id,max((c.year-1)*52+c.week-1) AS latest_show_week,
      avg(c.crowd_response)::numeric(6,1)::text AS recent_avg_crowd,
      count(*)::integer AS completed_events
     FROM ppw_completed_shows c
     WHERE c.world_id=$1
       AND (c.year,c.week)>=($2::integer,$3::integer)
       AND (c.year,c.week)<=($4::integer,$5::integer)
     GROUP BY c.promotion_id
   )
   SELECT p.promotion_id,p.name,p.tier,p.media_reach,
    p.ai_risk_tolerance,p.ai_match_quality_preference,p.ai_star_preference,
    p.management_mode,
    EXISTS(SELECT 1 FROM ppw_promotion_controls owners
     WHERE owners.world_id=p.world_id AND owners.promotion_id=p.promotion_id
      AND owners.active) AS human_managed,
    r.latest_show_week,
    r.recent_avg_crowd,coalesce(r.completed_events,0) AS completed_events
   FROM ppw_promotions p LEFT JOIN recent r ON r.promotion_id=p.promotion_id
   WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
   ORDER BY p.media_reach DESC NULLS LAST,p.name ASC,p.promotion_id ASC
   LIMIT 129`,window);
  if(companies.length>128)throw new Error("Industry company bound exceeded");
  const broadcasts=await tx.query<{show_id:string;promotion_id:string;
   promotion_name:string;show_name:string|null;booking_class:string;
   year:number;week:number;crowd_response:string|number;
   show_day:number|null;human_managed:boolean}>(`
   SELECT c.show_id,c.promotion_id,p.name AS promotion_name,
    d.show_name,d.booking_class,c.year,c.week,
    c.crowd_response,d.show_day,
    EXISTS(SELECT 1 FROM ppw_promotion_controls controller
     WHERE controller.world_id=c.world_id AND controller.promotion_id=c.promotion_id
     AND controller.active) AS human_managed
   FROM ppw_completed_shows c
   JOIN ppw_promotions p ON p.world_id=c.world_id
    AND p.promotion_id=c.promotion_id
   JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id
   WHERE c.world_id=$1 AND p.lifecycle='ACTIVE'
    AND (c.year,c.week)>=($2::integer,$3::integer)
    AND (c.year,c.week)<=($4::integer,$5::integer)
   ORDER BY c.year DESC,c.week DESC,d.show_day DESC NULLS LAST,
    c.show_id DESC LIMIT 25`,window);
  // Public Industry stories are restricted to verified, completed World
  // events. No wages, negotiation terms, or private commitments are selected.
  const stories=await tx.query<{event_id:string|number;year:number;week:number;
   event_type:string;person_id:string|null;person_name:string|null;
   promotion_id:string|null;promotion_name:string|null;from_tier:string|null;
   to_tier:string|null;career_stage:string|null}>(`
   SELECT e.event_id::text,e.year,e.week,e.event_type,
    e.payload->>'personId' AS person_id,
    coalesce(person.name,e.payload->>'name') AS person_name,
    e.payload->>'promotionId' AS promotion_id,promotion.name AS promotion_name,
    e.payload->>'fromTier' AS from_tier,e.payload->>'toTier' AS to_tier,
    e.payload->>'to' AS career_stage
   FROM ppw_ledger_events e
   LEFT JOIN ppw_people person ON person.world_id=e.world_id
    AND person.person_id=e.payload->>'personId'
   LEFT JOIN ppw_promotions promotion ON promotion.world_id=e.world_id
    AND promotion.promotion_id=e.payload->>'promotionId'
   WHERE e.world_id=$1 AND (e.year,e.week)>=($2::integer,$3::integer)
    AND (e.year,e.week)<=($4::integer,$5::integer)
    AND e.event_type IN ('WRESTLER_RETIRED','WRESTLER_DEBUTED',
     'LEGEND_ARRIVED','CAREER_STAGE_CHANGED','PROMOTION_TIER_CHANGED','PROMOTION_RESTRUCTURED',
     'PROMOTION_ENTERED_DORMANCY','PROMOTION_RECOVERED_FROM_DISTRESS')
    AND (e.event_type<>'CAREER_STAGE_CHANGED' OR
     e.payload->>'significance'='NOTABLE')
   ORDER BY e.year DESC,e.week DESC,e.event_id DESC LIMIT 12`,window);
  return {worldName:clock.world_name,year:clock.year,week:clock.week,
   phase:clock.phase,nextLockEpoch:Number(clock.next_lock_epoch),
   ownPromotionId:promotionId,ownPromotionName:clock.own_name,
   promotions:companies.map((p,i)=>({
    promotionId:p.promotion_id,name:p.name,tier:p.tier,
    rank:i+1,mediaReach:p.media_reach,
    managementMode:p.management_mode,
    publicIdentity:!p.human_managed&&p.management_mode==="AI"&&
     p.ai_risk_tolerance!==null&&p.ai_match_quality_preference!==null&&
     p.ai_star_preference!==null?
     AI_IDENTITY_LABELS[aiPromotionIdentity({
      riskTolerance:p.ai_risk_tolerance,
      matchQualityPreference:p.ai_match_quality_preference,
      starPreference:p.ai_star_preference
     })]:null,
    latestCompletedWeekIndex:p.latest_show_week,
    recentAverageCrowd:p.recent_avg_crowd===null?null:Number(p.recent_avg_crowd),
    recentShowCount:p.completed_events,
    isYours:p.promotion_id===promotionId
   })),
   headlines:stories.map(s=>({
    id:String(s.event_id),kind:s.event_type,year:s.year,week:s.week,
    personId:s.person_id,personName:s.person_name,
    promotionId:s.promotion_id,promotionName:s.promotion_name,
    fromTier:s.from_tier,toTier:s.to_tier,careerStage:s.career_stage
   })),
   broadcasts:broadcasts.map(s=>({
    showId:s.show_id,promotionId:s.promotion_id,
    promotionName:s.promotion_name,
    showName:s.show_name??(s.booking_class==="PREMIUM"?"Premium event":"Weekly show"),
    bookingClass:s.booking_class,year:s.year,week:s.week,
    day:s.show_day,crowdResponse:Number(s.crowd_response),
    isYours:s.promotion_id===promotionId,
    humanManaged:s.human_managed
   }))
  };
 });
}

/** Public wrestler shortlist for one chosen promotion; not part of the
 * recurring Industry overview. Private employment terms stay sealed.
 */
export async function readIndustryFeaturedTalent(pool:TransactionPool,input:{
 worldId:string;promotionId:string;playerId:string;targetPromotionId:string;
}){
 const {worldId,promotionId,playerId,targetPromotionId}=input;
 if(![worldId,promotionId,playerId,targetPromotionId].every(s=>
  typeof s==="string"&&s.length>0&&s.length<=200))
  throw new Error("Invalid featured talent scope");
 return withSqlClient(pool,async tx=>{
  const authority=await tx.query<{target_name:string;week_index:number;seed:string|number}>([
   "SELECT rival.name AS target_name,(w.year-1)*52+w.week-1 AS week_index,w.seed",
   "FROM ppw_worlds w JOIN ppw_promotion_controls control",
   "ON control.world_id=w.world_id AND control.player_id=$2",
   "AND control.promotion_id=$3 AND control.active",
   "JOIN ppw_memberships membership ON membership.world_id=w.world_id",
   "AND membership.player_id=control.player_id AND membership.status='ACTIVE'",
   "JOIN ppw_promotions owned ON owned.world_id=w.world_id",
   "AND owned.promotion_id=control.promotion_id AND owned.lifecycle='ACTIVE'",
   "JOIN ppw_promotions rival ON rival.world_id=w.world_id",
   "AND rival.promotion_id=$4 AND rival.lifecycle='ACTIVE'",
   "WHERE w.world_id=$1 LIMIT 1"
  ].join(" "),[worldId,playerId,promotionId,targetPromotionId]);
  if(authority.length!==1)throw new Error("Featured talent access denied");
  const rows=await tx.query<{person_id:string;name:string;booking_division:string|null;
   popularity:number|null;recognition:number|null;momentum:number|null;
   in_ring_quality:number|null;match_craft:number|null;presentation:number|null;
   default_alignment:string|null;portable_gimmick_id:string|null}>([
   "SELECT p.person_id,p.name,p.booking_division,p.popularity,p.recognition,",
   "p.momentum,p.in_ring_quality,p.match_craft,p.presentation,",
   "p.default_alignment,p.portable_gimmick_id",
   "FROM ppw_people p WHERE p.world_id=$1 AND p.status='ACTIVE'",
   "AND EXISTS (SELECT 1 FROM ppw_contracts c",
   "WHERE c.world_id=p.world_id AND c.person_id=p.person_id",
   "AND c.promotion_id=$2 AND c.status='SIGNED'",
   "AND c.start_week_index<=$3 AND c.expires_week_index>=$3)",
   "ORDER BY p.popularity DESC NULLS LAST,p.recognition DESC NULLS LAST,",
   "p.name ASC,p.person_id ASC LIMIT 9"
  ].join(" "),[worldId,targetPromotionId,authority[0]!.week_index]);
  return {promotionId:targetPromotionId,promotionName:authority[0]!.target_name,
   moreThanEight:rows.length>8,
   people:rows.slice(0,8).map(p=>({
    personId:p.person_id,name:p.name,division:p.booking_division,
    popularity:p.popularity,recognition:p.recognition,momentum:p.momentum,
    inRingQuality:p.in_ring_quality,matchCraft:p.match_craft,
    presentation:p.presentation,alignment:effectiveWrestlerAlignment(authority[0]!.seed,p.person_id,p.default_alignment,null),
    gimmickId:p.portable_gimmick_id
   }))};
 });
}
