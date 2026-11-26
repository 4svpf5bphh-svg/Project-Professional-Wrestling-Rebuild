import {weekDateRangeSql} from "./week-date-sql.js";
/** Six-week show planning, retaining PPW's authored schedule and provisional
 * venue claims. One indexed controlled-promotion snapshot, never World hydration.
 * Calendar dates are PPW weeks, not real local dates or scheduler activations.
 */
import {randomUUID} from "node:crypto";
import {defaults,seriesDue,type ShowSeries} from "../domain/show-calendar.js";
import {scheduledSeriesOnWeek} from "../domain/annual-premium-plan.js";
import {decodeAnnualPremiumSnapshot,plansMap}
 from "./annual-premium-calendar.js";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import type {TicketStrategy} from "../domain/legacy-show-economics.js";
import {commercialCompanyName} from "../domain/commercial-offers.js";
import {validateCreativeOutline,type CreativeWeekOutline}
 from "../domain/creative-outline.js";

export interface BroadcastPlannerSlot{
 networkName:string;offerCode:string;day:number;hour:number;
 startWeekIndex:number;endWeekIndex:number;
}
export type PlannedEventType="REGULAR"|"MAJOR";
export interface PlannerScope {worldId:string;promotionId:string;playerId:string}
export interface CreativeOutlineInput extends PlannerScope{
 requestId:string;expectedRevision:number;notes:CreativeWeekOutline[];
}
export interface PlanWeekInput extends PlannerScope {
 requestId:string;expectedRevision:number;year:number;week:number;
 eventType:PlannedEventType;day:number;marketId:string;venueId:string;
 ticketStrategy:TicketStrategy;draftId?:string;showSeriesId?:string;
}
export interface PlannerVenue {
 venueId:string;marketId:string;marketName:string;name:string;capacity:number;
 weeklyHireCost:number;prestige:number|null;productionSuitability:number|null;
 awareness:number;liveStrength:number;loyalty:number;
 audiencePotential:number;wrestlingInterest:number;spendingIndex:number;
 strongestRival:{name:string;tier:string;liveStrength:number;basedHere:boolean}|null;
 home:boolean;
}
export interface PlannedShow {
 programmeChapters?:{programmeId:string;name:string;matches:number;
  segments:number;finalePayoff?:string|null}[];
 draftId:string;year:number;week:number;status:string;eventType:PlannedEventType;
 day:number|null;marketId:string|null;venueId:string|null;
 marketName:string|null;venueName:string|null;ticketStrategy:TicketStrategy|null;
 ready:boolean;slots:number;posterStyle?:string|null;bookingClass:"REGULAR"|"PREMIUM";showSeriesId:string|null;showName:string;
}
export interface PlannerWeek {
 year:number;week:number;offset:number;required:boolean;major:boolean;
 canEdit:boolean;shows:PlannedShow[];scheduled:ShowSeries[];
}
/** Rival plans are anonymous, provisional venue intentions, not reserved slots. */
export interface PlannerVenuePressure {
 year:number;week:number;day:number;venueId:string;otherPromotions:number;
}
export interface ActiveProgrammeOutline {programmeId:string;name:string}
export interface PlannerView {
 worldName:string;promotionName:string;year:number;week:number;
 worldRevision:number;canEdit:boolean;creativeOutline:CreativeWeekOutline[];
 activeProgrammes:ActiveProgrammeOutline[];homeMarketId:string|null;eventPosterStyle?:string|null;broadcastPackage?:string|null;
 venues:PlannerVenue[];weeks:PlannerWeek[];venuePressure:PlannerVenuePressure[];
 broadcastSlot:BroadcastPlannerSlot|null;
}
const id=(s:unknown):s is string=>typeof s==="string"&&s.trim().length>0&&s.length<=200;
function checkScope(s:PlannerScope){
 if(![s.worldId,s.promotionId,s.playerId].every(id))
  throw new Error("Invalid show planner identity");
}
const weekIndex=(year:number,week:number)=>(year-1)*52+week-1;
function dateAt(index:number){return {year:Math.floor(index/52)+1,week:index%52+1};}
type Owner={world_name:string;promotion_name:string;year:number;week:number;
 revision:string|number;booking_open:boolean;cadence:number;
 premium_plan_start_year:number;annual_plans:unknown;
 major_interval:number|null;home_market_id:string|null;event_poster:string|null;
 broadcast_package:string|null;creative_outline:unknown;active_programmes:unknown;
 broadcast_slot:{offerCode:string;day:number|null;hour:number|null;
 startWeekIndex:number;endWeekIndex:number}|null};
async function owner(tx:SqlRows,s:PlannerScope):Promise<Owner>{
 checkScope(s);
 const rows=await tx.query<Owner>(`
 SELECT w.name AS world_name,p.name AS promotion_name,w.year,w.week,
  w.revision,(w.phase IN ('OPEN','UPDATING') AND w.next_lock_at>clock_timestamp()) AS booking_open,
  p.event_cadence_weeks AS cadence,w.major_event_interval_weeks AS major_interval,
  w.premium_plan_start_year,p.creative_outline,
  p.home_market_id,
  -- Include active storylines even when no future chapter exists yet. This
  -- bounded lateral projection reuses the owner read, not a fifth RPC/query.
  (SELECT coalesce(jsonb_agg(jsonb_build_object(
    'programmeId',active.programme_id,'name',active.label)
    ORDER BY active.started_week_index DESC,active.programme_id),'[]'::jsonb)
   FROM (
    SELECT pr.programme_id,pr.started_week_index,
      (SELECT coalesce(string_agg(CASE WHEN ref.side='A' THEN
         coalesce(person.name,team.name,ref.ref_id) END,' & '
         ORDER BY ref.position),'Side A') || ' vs ' ||
       coalesce(string_agg(CASE WHEN ref.side='B' THEN
         coalesce(person.name,team.name,ref.ref_id) END,' & '
         ORDER BY ref.position),'Side B')
       FROM ppw_programme_side_refs ref
       LEFT JOIN ppw_people person ON person.world_id=ref.world_id
        AND person.person_id=ref.ref_id AND ref.ref_kind='PERSON'
       LEFT JOIN ppw_tag_teams team ON team.world_id=ref.world_id
        AND team.team_id=ref.ref_id AND ref.ref_kind='TEAM'
       WHERE ref.world_id=pr.world_id AND ref.promotion_id=pr.promotion_id
        AND ref.programme_id=pr.programme_id) AS label
    FROM ppw_programmes pr
    WHERE pr.world_id=w.world_id AND pr.promotion_id=p.promotion_id
      AND pr.status='ACTIVE'
    ORDER BY pr.started_week_index DESC NULLS LAST,pr.programme_id LIMIT 16
   ) active) AS active_programmes,
   (SELECT style FROM ppw_kp_event_poster_styles WHERE player_id=$3) AS event_poster,
   (SELECT style FROM ppw_kp_broadcast_packages WHERE player_id=$3) AS broadcast_package,
   (SELECT jsonb_build_object('offerCode',d.offer_code,'day',d.airing_day,
     'hour',d.airing_hour,'startWeekIndex',d.start_week_index,
     'endWeekIndex',d.end_week_index)
    FROM ppw_commercial_deals d
    WHERE d.world_id=w.world_id AND d.promotion_id=p.promotion_id
     AND d.kind='BROADCAST' AND d.status='ACTIVE'
     AND d.end_week_index >= (w.year-1)*52+w.week-1
    ORDER BY d.end_week_index DESC LIMIT 1) AS broadcast_slot,
   (SELECT coalesce(jsonb_agg(jsonb_build_object('year',pplan.year,
    'events',pplan.events,'tierAtCommit',pplan.tier_at_commit,
    'confirmedWeekIndex',pplan.confirmed_week_index) ORDER BY pplan.year),'[]'::jsonb)
    FROM ppw_annual_premium_plans pplan
    WHERE pplan.world_id=w.world_id AND pplan.promotion_id=p.promotion_id
      AND pplan.year BETWEEN w.year AND w.year+1) AS annual_plans
   FROM ppw_worlds w
 JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=$2
 JOIN ppw_promotion_controls c ON c.world_id=w.world_id
  AND c.promotion_id=p.promotion_id AND c.player_id=$3 AND c.active
 JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id
  AND m.status='ACTIVE'
 WHERE w.world_id=$1 AND p.lifecycle='ACTIVE'`,[s.worldId,s.promotionId,s.playerId]);
 if(rows.length!==1)throw new Error("Planner promotion access denied");
 return rows[0]!;
}
function major(index:number,interval:number|null){
 return interval!==null&&interval>0&&(index+1)%interval===0;
}
export async function readSixWeekPlanner(pool:TransactionPool,s:PlannerScope):Promise<PlannerView>{
 return withSqlClient(pool,async tx=>{
  const owned=await owner(tx,s),start=weekIndex(owned.year,owned.week);
  const drafts=await tx.query<{
   draft_id:string;year:number;week:number;status:string;booking_class:"REGULAR"|"PREMIUM";show_series_id:string|null;show_name:string|null;
   event_type:PlannedEventType|null;show_day:number|null;market_id:string|null;
   venue_id:string|null;ticket_strategy:TicketStrategy|null;
   market_name:string|null;venue_name:string|null;
   lock_ready_fingerprint:string|null;slots:number;programme_chapters:unknown;
  }>(`
 SELECT d.draft_id,d.year,d.week,d.status,d.booking_class,d.show_series_id,d.show_name,d.event_type,d.show_day,
   d.market_id,d.venue_id,d.ticket_strategy,
   m.name AS market_name,v.name AS venue_name,d.lock_ready_fingerprint,
   -- Real pre-booked Programme activities in this exact future show, not notes or predictions.
   -- Reuse the existing indexed draft query: no fifth Planner SQL roundtrip.
   (SELECT coalesce(jsonb_agg(jsonb_build_object(
     'programmeId',chapter.programme_id,'name',coalesce(names.name,'Programme'),
     'matches',chapter.matches,'segments',chapter.segments,
     'finalePayoff',plannedFinale.payoff)
     ORDER BY chapter.programme_id),'[]'::jsonb)
    FROM (
     SELECT a.programme_id,
       count(*) FILTER (WHERE a.kind='MATCH')::integer AS matches,
       count(*) FILTER (WHERE a.kind='SEGMENT')::integer AS segments
     FROM ppw_programme_match_activities a
     WHERE a.world_id=d.world_id AND a.promotion_id=d.promotion_id
       AND a.draft_id=d.draft_id
     GROUP BY a.programme_id ORDER BY a.programme_id LIMIT 12
    ) chapter
    LEFT JOIN LATERAL (
     SELECT coalesce(string_agg(CASE WHEN refs.side='A' THEN
       coalesce(person.name,team.name,refs.ref_id) END,', ' ORDER BY refs.position),'Side A')
       || ' vs ' ||
       coalesce(string_agg(CASE WHEN refs.side='B' THEN
       coalesce(person.name,team.name,refs.ref_id) END,', ' ORDER BY refs.position),'Side B')
       AS name
     FROM ppw_programme_side_refs refs
     LEFT JOIN ppw_people person ON person.world_id=refs.world_id
       AND person.person_id=refs.ref_id AND refs.ref_kind='PERSON'
     LEFT JOIN ppw_tag_teams team ON team.world_id=refs.world_id
       AND team.team_id=refs.ref_id AND refs.ref_kind='TEAM'
     WHERE refs.world_id=d.world_id AND refs.promotion_id=d.promotion_id
       AND refs.programme_id=chapter.programme_id
    ) names ON true
    -- A PPV payoff is an explicit, still-linked author decision, not a
    -- predicted winner. Once its card slot is removed, stop advertising it.
    LEFT JOIN LATERAL (
     SELECT f.payoff
     FROM ppw_programme_finales f
     WHERE f.world_id=d.world_id AND f.promotion_id=d.promotion_id
       AND f.programme_id=chapter.programme_id AND f.show_id=d.draft_id
       AND f.resolved_week_index IS NULL
       AND EXISTS (
        SELECT 1 FROM ppw_programme_match_activities linked
        WHERE linked.world_id=f.world_id AND linked.promotion_id=f.promotion_id
          AND linked.programme_id=f.programme_id
          AND linked.draft_id=f.show_id AND linked.slot_id=f.slot_id
       )
     LIMIT 1
    ) plannedFinale ON true
   ) AS programme_chapters,
   (SELECT count(*)::integer FROM ppw_card_slots c
    WHERE c.world_id=d.world_id AND c.draft_id=d.draft_id) AS slots
 FROM ppw_booking_drafts d
 LEFT JOIN ppw_markets m ON m.world_id=d.world_id AND m.market_id=d.market_id
 LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
 WHERE d.world_id=$1 AND d.promotion_id=$2
 AND ${weekDateRangeSql("d","$3","$4")}
 ORDER BY d.year,d.week,d.draft_id LIMIT 73`,
 [s.worldId,s.promotionId,start,start+6]);
 if(drafts.length>72)throw new Error("Planner show count exceeds safe limit");
 const end=dateAt(start+6);
 // Old intentions may remain in the compact JSON after World advances.
 // Read only the seven current weeks; never reinterpret an old note as an event.
 const creativeOutline=Array.isArray(owned.creative_outline)?
  owned.creative_outline.filter((x):x is CreativeWeekOutline=>
   x!==null&&typeof x==="object"&&
   Number.isSafeInteger(x.year)&&Number.isSafeInteger(x.week)&&
   typeof x.note==="string"&&x.note.length>0&&x.note.length<=240&&
   weekIndex(x.year,x.week)>=start&&weekIndex(x.year,x.week)<=start+6).slice(0,7):[];
 const venues=await tx.query<{
  venue_id:string;market_id:string;market_name:string;name:string;
  capacity:number;weekly_hire_cost:string|number;
  prestige:number|null;production_suitability:number|null;
  awareness:number;live_strength:number;loyalty:number;
  audience_potential:number;wrestling_interest:number;spending_index:number;
  rival_name:string|null;rival_tier:string|null;rival_live_strength:number|null;
  rival_based_here:boolean|null;venue_pressure:unknown;
 }>(`
 SELECT v.venue_id,v.market_id,m.name AS market_name,v.name,v.capacity,
  v.weekly_hire_cost,v.prestige,v.production_suitability,
  local.awareness,local.live_strength,local.loyalty,
  m.audience_potential,m.wrestling_interest,m.spending_index,
  rival.name AS rival_name,rival.tier AS rival_tier,
  rival.live_strength AS rival_live_strength,
  rival.based_here AS rival_based_here,
  CASE WHEN row_number() OVER (ORDER BY m.name,v.name,v.venue_id)=1 THEN (
   SELECT coalesce(jsonb_agg(jsonb_build_object(
    'year',conflict.year,'week',conflict.week,'day',conflict.show_day,
    'venueId',conflict.venue_id,'otherPromotions',conflict.other_promotions)
    ORDER BY conflict.year,conflict.week,conflict.show_day,conflict.venue_id),'[]'::jsonb)
   FROM (
    SELECT d.year,d.week,d.show_day,d.venue_id,
     count(DISTINCT d.promotion_id)::integer AS other_promotions
    FROM ppw_booking_drafts d
    JOIN ppw_promotions competitor ON competitor.world_id=d.world_id
     AND competitor.promotion_id=d.promotion_id AND competitor.lifecycle='ACTIVE'
    WHERE d.world_id=$1 AND d.promotion_id<>$2
     AND d.year BETWEEN $5 AND $6
     AND ${weekDateRangeSql("d","$3","$4")}
     AND d.status IN ('DRAFT','SUBMITTED')
     AND d.venue_id IS NOT NULL AND d.show_day BETWEEN 1 AND 7
    GROUP BY d.year,d.week,d.show_day,d.venue_id
    ORDER BY d.year,d.week,d.show_day,d.venue_id LIMIT 129
   ) conflict
  ) END AS venue_pressure
 FROM ppw_venues v
 JOIN ppw_markets m ON m.world_id=v.world_id AND m.market_id=v.market_id
 JOIN ppw_promotion_market_states local ON local.world_id=v.world_id
  AND local.market_id=v.market_id AND local.promotion_id=$2
 LEFT JOIN LATERAL (
  SELECT competitor.name,competitor.tier,reach.live_strength,
    (competitor.home_market_id=v.market_id) AS based_here
  FROM ppw_promotion_market_states reach
  JOIN ppw_promotions competitor ON competitor.world_id=reach.world_id
   AND competitor.promotion_id=reach.promotion_id AND competitor.lifecycle='ACTIVE'
  WHERE reach.world_id=v.world_id AND reach.market_id=v.market_id
   AND reach.promotion_id<>$2
  ORDER BY reach.live_strength DESC NULLS LAST,competitor.promotion_id LIMIT 1
 ) rival ON TRUE
 WHERE v.world_id=$1 AND v.status='ACTIVE'
 AND v.capacity IS NOT NULL AND v.weekly_hire_cost IS NOT NULL
 ORDER BY m.name,v.name,v.venue_id LIMIT 101`,
 [s.worldId,s.promotionId,start,start+6,owned.year,end.year]);
 if(venues.length>100)throw new Error("Planner venue choices exceed safe limit");
 // The anonymous venue grid is folded into the existing venue read, emitted
 // only on the first venue row to avoid duplicating data across each building.
 // A plan is provisional; neither promotion acquires priority for saving first.
 const pressureRaw=venues[0]?.venue_pressure;
 const pressure=Array.isArray(pressureRaw)?pressureRaw.filter((p):p is PlannerVenuePressure=>
  p!==null&&typeof p==="object"&&!Array.isArray(p)&&
  Number.isSafeInteger(p.year)&&Number.isSafeInteger(p.week)&&
  Number.isSafeInteger(p.day)&&typeof p.venueId==="string"&&
  Number.isSafeInteger(p.otherPromotions)&&p.otherPromotions>0):[];
 if(pressure.length>128)throw new Error("Venue planning grid exceeds safe limit");
 const configured=await tx.query<{
  series_id:string;name:string;role:ShowSeries["role"];
  event_type:ShowSeries["eventType"];cadence_weeks:number;anchor_week:number;
  importance:number;active:boolean;poster_style:string|null;
 }>([
  "SELECT series_id,name,role,event_type,cadence_weeks,anchor_week,importance,active,",
   "(SELECT style FROM ppw_kp_series_posters poster WHERE poster.world_id=$1",
   "AND poster.promotion_id=$2 AND poster.series_id=ppw_show_series.series_id",
   "AND poster.player_id=$3) AS poster_style",
  "FROM ppw_show_series WHERE world_id=$1 AND promotion_id=$2",
  "ORDER BY series_id LIMIT 25"
 ].join(" "),[s.worldId,s.promotionId,s.playerId]);
 if(configured.length>24)throw new Error("Planner calendar series limit exceeded");
 const scheduled:ShowSeries[]=configured.length?configured.map(x=>({
  seriesId:x.series_id,name:x.name,role:x.role,eventType:x.event_type,
  cadenceWeeks:x.cadence_weeks,anchorWeek:x.anchor_week,
  importance:x.importance,active:x.active,posterStyle:x.poster_style
 })):defaults(owned.promotion_name,owned.cadence,owned.major_interval??4);
 const yearly=new Map(plansMap(
  decodeAnnualPremiumSnapshot(owned.annual_plans)));
 for(const year of [owned.year,dateAt(start+6).year])
  if(year>=owned.premium_plan_start_year&&!yearly.has(year))
   yearly.set(year,[]);
 return {
  worldName:owned.world_name,promotionName:owned.promotion_name,
  year:owned.year,week:owned.week,worldRevision:Number(owned.revision),
  creativeOutline,
  activeProgrammes:Array.isArray(owned.active_programmes)?
   owned.active_programmes.filter((item):item is ActiveProgrammeOutline=>
    item!==null&&typeof item==="object"&&!Array.isArray(item)&&
    typeof item.programmeId==="string"&&item.programmeId.length>0&&
    item.programmeId.length<=200&&typeof item.name==="string"&&
    item.name.length>0&&item.name.length<=300).slice(0,16):[],
  canEdit:owned.booking_open,homeMarketId:owned.home_market_id,eventPosterStyle:owned.event_poster,
   broadcastPackage:owned.broadcast_package,
  broadcastSlot:owned.broadcast_slot&&owned.broadcast_slot.day!==null&&
   owned.broadcast_slot.hour!==null&&
   Number.isInteger(owned.broadcast_slot.day)&&
   owned.broadcast_slot.day>=1&&owned.broadcast_slot.day<=7?{
    offerCode:owned.broadcast_slot.offerCode,
    networkName:commercialCompanyName(owned.broadcast_slot.offerCode),
    day:owned.broadcast_slot.day,hour:owned.broadcast_slot.hour,
    startWeekIndex:owned.broadcast_slot.startWeekIndex,
    endWeekIndex:owned.broadcast_slot.endWeekIndex
   }:null,
  venuePressure:pressure,
  venues:venues.map(v=>({venueId:v.venue_id,marketId:v.market_id,
   marketName:v.market_name,name:v.name,capacity:v.capacity,
   weeklyHireCost:Number(v.weekly_hire_cost),
   prestige:v.prestige,productionSuitability:v.production_suitability,
   awareness:v.awareness,
   liveStrength:v.live_strength,loyalty:v.loyalty,
   audiencePotential:v.audience_potential,wrestlingInterest:v.wrestling_interest,
   spendingIndex:v.spending_index,
   strongestRival:v.rival_name===null||v.rival_live_strength===null?null:
    {name:v.rival_name,tier:v.rival_tier??"UNKNOWN",
     liveStrength:v.rival_live_strength,basedHere:v.rival_based_here===true},
   home:v.market_id===owned.home_market_id})),
  weeks:Array.from({length:7},(_,offset)=>{
   const index=start+offset,when=dateAt(index);
   const due=scheduledSeriesOnWeek(scheduled,when.year,when.week,yearly);
   return {...when,offset,required:due.length>0,
    major:due.some(x=>x.eventType==="MAJOR"),canEdit:owned.booking_open,
    scheduled:due,
    shows:drafts.filter(d=>d.year===when.year&&d.week===when.week).map(d=>({
     bookingClass:d.booking_class,showSeriesId:d.show_series_id,
     programmeChapters:Array.isArray(d.programme_chapters)?d.programme_chapters.filter(
      (chapter):chapter is {programmeId:string;name:string;matches:number;
       segments:number;finalePayoff:string|null}=>
       chapter!==null&&typeof chapter==="object"&&
       typeof chapter.programmeId==="string"&&typeof chapter.name==="string"&&
       Number.isInteger(chapter.matches)&&Number.isInteger(chapter.segments)&&
       (chapter.finalePayoff===null||typeof chapter.finalePayoff==="string")).slice(0,12):[],
      posterStyle:scheduled.find(x=>x.seriesId===d.show_series_id)?.posterStyle??null,
     showName:d.show_name??scheduled.find(x=>x.seriesId===d.show_series_id)?.name??
      (d.booking_class==="PREMIUM"?"Premium event":"Weekly show"),
     draftId:d.draft_id,year:d.year,week:d.week,status:d.status,
     eventType:d.event_type??(major(index,owned.major_interval)?"MAJOR":"REGULAR"),
     day:d.show_day,marketId:d.market_id,venueId:d.venue_id,
     marketName:d.market_name,venueName:d.venue_name,
     ticketStrategy:d.ticket_strategy,ready:d.lock_ready_fingerprint!==null,
     slots:d.slots
    }))}
  })
 };
 });
}
/** Plan or edit exactly one standard weekly show. Other promotions' venue
 * claims are not used to reject a player; World resource arbitration is fair.
 * No wrestler is committed until a valid authored card is confirmed.
 */
export async function planShowWeek(pool:TransactionPool,input:PlanWeekInput){
 checkScope(input);
 if(!Number.isSafeInteger(input.year)||input.year<1||
  !Number.isSafeInteger(input.week)||input.week<1||input.week>52||
  !Number.isSafeInteger(input.day)||input.day<1||input.day>7||
  !id(input.venueId)||!id(input.marketId)||
  (input.draftId!==undefined&&!id(input.draftId))||
  (input.showSeriesId!==undefined&&!id(input.showSeriesId))||
  !["REGULAR","MAJOR"].includes(input.eventType)||
  !["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"].includes(input.ticketStrategy))
  throw new Error("Invalid show planning selection");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"PLAN_SHOW_WEEK",requiresOpenWeek:true,execute:async tx=>{
   const auth=await owner(tx,input);
   if(!auth.booking_open)throw new Error("Show planning is closed at World Lock");
   const current=weekIndex(auth.year,auth.week),target=weekIndex(input.year,input.week);
   if(target<current||target>current+6)
    throw new Error("Show must be planned in the current week or next six weeks");
   const configured=await tx.query<{series_id:string;name:string;role:ShowSeries["role"];
    event_type:PlannedEventType;cadence_weeks:number;anchor_week:number;importance:number;active:boolean}>([
    "SELECT series_id,name,role,event_type,cadence_weeks,anchor_week,importance,active",
    "FROM ppw_show_series WHERE world_id=$1 AND promotion_id=$2 AND active",
    "ORDER BY series_id LIMIT 17"
   ].join(" "),[input.worldId,input.promotionId]);
   if(configured.length>16)throw new Error("Show calendar exceeds safe limit");
   const series:ShowSeries[]=configured.length?configured.map(x=>({
    seriesId:x.series_id,name:x.name,role:x.role,eventType:x.event_type,
    cadenceWeeks:x.cadence_weeks,anchorWeek:x.anchor_week,
    importance:x.importance,active:x.active
   })):defaults(auth.promotion_name,auth.cadence,auth.major_interval??4);
   const identity=input.showSeriesId?
    series.find(s=>s.seriesId===input.showSeriesId):null;
   if(input.showSeriesId&&!identity)
    throw new Error("Show identity not on this promotion's calendar");
   const plan=new Map(plansMap(
    decodeAnnualPremiumSnapshot(auth.annual_plans)));
   if(input.year>=auth.premium_plan_start_year&&!plan.has(input.year))
    plan.set(input.year,[]);
   const due=scheduledSeriesOnWeek(series,input.year,input.week,plan);
   const selected=input.showSeriesId?
    due.find(s=>s.seriesId===input.showSeriesId):null;
   if(identity&&!selected)
    throw new Error("This show is not scheduled in your confirmed annual calendar");
   const event:PlannedEventType=selected?.eventType??"REGULAR";
   if(input.eventType!==event)
    throw new Error("Show type must match the calendar event");
   // The TV licence fixes airtime, while the original recurrent series fixes
   // which weeks actually contain an episode. Do not allow arbitrary extra
   // broadcasts in off-cadence weeks via a missing series ID.
   // Existing legacy drafts remain editable; historical shows are untouched.
   if(!input.draftId&&event==="REGULAR"&&
    !due.some(s=>s.eventType==="REGULAR"))
    throw new Error("No regular TV episode is due this week. "+
     "Select a scheduled broadcast week in Calendar.");
   const bookingClass:"REGULAR"|"PREMIUM"=
    selected?.eventType==="MAJOR"?"PREMIUM":"REGULAR";
   // Contracted television dates are server-authoritative, not a UI hint.
   // PPVs are independent of the network's weekly slot.
   const slot=auth.broadcast_slot;
   if(bookingClass==="REGULAR"&&slot&&slot.day!==null&&
    target>=slot.startWeekIndex&&target<=slot.endWeekIndex&&
    input.day!==slot.day)
    throw new Error("Your signed network requires "+
     ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][slot.day-1]+
     " television. Request a new slot in Business → Deals.");
   const eligible=await tx.query<{venue_id:string}>(`
    SELECT v.venue_id FROM ppw_venues v
    JOIN ppw_promotion_market_states local ON local.world_id=v.world_id
     AND local.market_id=v.market_id AND local.promotion_id=$2
    WHERE v.world_id=$1 AND v.venue_id=$3 AND v.market_id=$4
     AND v.status='ACTIVE' AND v.capacity IS NOT NULL
     AND v.weekly_hire_cost IS NOT NULL`,
    [input.worldId,input.promotionId,input.venueId,input.marketId]);
   if(eligible.length!==1)throw new Error("Choose an available venue in that market");
   const allDrafts=await tx.query<{draft_id:string;status:string;show_series_id:string|null;
    booking_class:"REGULAR"|"PREMIUM";show_day:number|null;venue_id:string|null}>(`
    SELECT draft_id,status,show_series_id,booking_class,show_day,venue_id
    FROM ppw_booking_drafts
    WHERE world_id=$1 AND promotion_id=$2 AND year=$3 AND week=$4
      AND status IN ('DRAFT','SUBMITTED')
    ORDER BY booking_class,draft_id LIMIT 5`,
    [input.worldId,input.promotionId,input.year,input.week]);
   if(allDrafts.length>4)throw new Error("Too many weekly card drafts");
   const existing=allDrafts.filter(x=>x.booking_class===bookingClass);
   if(existing.length>1)throw new Error("Multiple show drafts need reconciliation");
   if(existing.length&&!input.draftId)
    throw new Error("This week already has a planned show");
   if(allDrafts.some(x=>x.booking_class!==bookingClass&&x.show_day===input.day))
    throw new Error("Your weekly show and PPV must run on different days");
   if(existing.length&&existing[0]!.show_series_id!== (selected?.seriesId??null))
    throw new Error("A different show identity already occupies this weekly slot");
   if(input.draftId){
    if(existing.length!==1||existing[0]!.draft_id!==input.draftId||
     existing[0]!.status!=="DRAFT")
     throw new Error("Only your existing draft can be rescheduled");
    const rows=await tx.query<{draft_id:string}>(`
     UPDATE ppw_booking_drafts
     SET show_day=$4,market_id=$5,venue_id=$6,ticket_strategy=$7,
       lock_ready_by_player_id=NULL,lock_ready_fingerprint=NULL,
       booking_expected_demand=NULL,booking_ticket_yield=NULL,
       booking_snapshot_fingerprint=NULL,revision=revision+1
     WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
      AND status='DRAFT' RETURNING draft_id`,
      [input.worldId,input.draftId,input.promotionId,input.day,
       input.marketId,input.venueId,input.ticketStrategy]);
    if(rows.length!==1)throw new Error("Show is no longer editable");
    return {draftId:input.draftId,year:input.year,week:input.week,
     status:"UPDATED" as const};
   }
   if(existing.length)throw new Error("This week already has a planned show");
   const draftId="planner-"+randomUUID();
   const created=await tx.query<{draft_id:string}>(`
    INSERT INTO ppw_booking_drafts(
     world_id,draft_id,promotion_id,year,week,status,show_day,
     event_type,market_id,venue_id,ticket_strategy,booking_class,show_series_id,show_name,event_importance)
    VALUES($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10,$11,$12,$13,$14)
    RETURNING draft_id`,
    [input.worldId,draftId,input.promotionId,input.year,input.week,
     input.day,event,input.marketId,input.venueId,input.ticketStrategy,
     bookingClass,selected?.seriesId??null,selected?.name??null,
     selected?.importance??70]);
   if(created.length!==1)throw new Error("Show draft was not created");
   return {draftId,year:input.year,week:input.week,status:"CREATED" as const};
  }});
}

/** One explicit player command saves the entire bounded six-week outline.
 * These notes never change a booked show, wrestler, programme or World result.
 * Updates are replay-safe, signed-owner scoped, and share World revision checks.
 */
export async function saveCreativeOutline(pool:TransactionPool,input:CreativeOutlineInput){
 checkScope(input);
 if(!id(input.requestId)||!Number.isSafeInteger(input.expectedRevision))
  throw new Error("Invalid creative outline request");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"SAVE_CREATIVE_OUTLINE",requiresOpenWeek:true,execute:async tx=>{
   const auth=await owner(tx,input);
   if(!auth.booking_open)
    throw new Error("Creative planning is closed during World Lock");
   const notes=validateCreativeOutline(input.notes,auth.year,auth.week);
   await tx.query(`
    UPDATE ppw_promotions SET creative_outline=$3::jsonb
    WHERE world_id=$1 AND promotion_id=$2
   `,[input.worldId,input.promotionId,JSON.stringify(notes)]);
   return {notes,status:"SAVED" as const};
  }});
}
