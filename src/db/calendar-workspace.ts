/** Authenticated, compact calendar identity editing and 26-week projection.
 * Recurrence is calculated from a handful of series rows; no World hydration,
 * polling, materialized occurrence rows or second World Lock timer.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {defaults,occurrences,seriesDue,dateAt,validateSchedule,validateSeries,weekIndex,
 type ShowSeries} from "../domain/show-calendar.js";
import {premiumPolicy,projectYearEvents,scheduledSeriesOnWeek,
 suggestedAnnualPremiumEvents,type AnnualPremiumEvent}
 from "../domain/annual-premium-plan.js";
import type {StandingTier} from "../domain/annual-promotion-standing.js";
import {decodeAnnualPremiumSnapshot,plansMap}
 from "./annual-premium-calendar.js";
export interface CalendarScope {worldId:string;promotionId:string;playerId:string}
export interface SeriesMutation extends CalendarScope {
 requestId:string;expectedRevision:number;series:ShowSeries;
}
export interface ArchiveSeries extends CalendarScope {
 requestId:string;expectedRevision:number;seriesId:string;
}
/** Owner-only, already booked shows within the six-week planning window.
 * Private venue, day and draft details never enter the public World agenda.
 */
export interface CalendarBooking {
 draftId:string;year:number;week:number;bookingClass:"REGULAR"|"PREMIUM";
 showSeriesId:string|null;showName:string;status:"DRAFT"|"SUBMITTED";
 day:number|null;venueName:string|null;marketName:string|null;
 ready:boolean;
}
type Owner={name:string;tier:StandingTier;year:number;week:number;
 premium_plan_start_year:number;revision:string|number;
 booking_open:boolean;cadence:number;major_interval:number|null;annual_plans:unknown;event_poster:string|null;broadcast_package:string|null};
type Row={series_id:string;name:string;role:ShowSeries["role"];
 event_type:ShowSeries["eventType"];cadence_weeks:number;anchor_week:number;
 importance:number;active:boolean;poster_style:string|null;earned_prestige:number;
 celebrated_editions:number;last_celebrated_week_index:number|null};
const validId=(s:unknown):s is string=>
 typeof s==="string"&&s.trim().length>0&&s.length<=200;
async function owner(tx:SqlRows,scope:CalendarScope):Promise<Owner>{
 if(![scope.worldId,scope.promotionId,scope.playerId].every(validId))
  throw new Error("Invalid show calendar identity");
 const rows=await tx.query<Owner>([
 "SELECT p.name,p.tier,w.year,w.week,w.premium_plan_start_year,w.revision,",
 "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open,",
 "p.event_cadence_weeks AS cadence,w.major_event_interval_weeks AS major_interval,",
  "(SELECT style FROM ppw_kp_event_poster_styles WHERE player_id=$3) AS event_poster,",
   "(SELECT style FROM ppw_kp_broadcast_packages WHERE player_id=$3) AS broadcast_package,",
  "(SELECT coalesce(jsonb_agg(jsonb_build_object('year',plan.year,",
  "'events',plan.events,'tierAtCommit',plan.tier_at_commit,",
  "'confirmedWeekIndex',plan.confirmed_week_index) ORDER BY plan.year),'[]'::jsonb)",
  "FROM ppw_annual_premium_plans plan WHERE plan.world_id=w.world_id",
  "AND plan.promotion_id=p.promotion_id AND plan.year BETWEEN w.year AND w.year+1)",
  "AS annual_plans",
 "FROM ppw_worlds w JOIN ppw_promotions p ON p.world_id=w.world_id",
 "AND p.promotion_id=$2 JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
 "AND c.promotion_id=p.promotion_id AND c.player_id=$3 AND c.active",
 "JOIN ppw_memberships m ON m.world_id=w.world_id AND m.player_id=c.player_id",
 "AND m.status='ACTIVE' WHERE w.world_id=$1 AND p.lifecycle='ACTIVE'"
 ].join(" "),[scope.worldId,scope.promotionId,scope.playerId]);
 if(rows.length!==1)throw new Error("Calendar promotion access denied");
 return rows[0]!;
}
async function load(tx:SqlRows,scope:CalendarScope,owned:Owner){
 const rows=await tx.query<Row>([
 "SELECT series_id,name,role,event_type,cadence_weeks,anchor_week,importance,active,",
 "earned_prestige,celebrated_editions,last_celebrated_week_index,",
 "(SELECT sp.style FROM ppw_kp_series_posters sp WHERE sp.world_id=$1",
 "AND sp.promotion_id=$2 AND sp.series_id=ppw_show_series.series_id",
 "AND sp.player_id=$3) AS poster_style",
 "FROM ppw_show_series WHERE world_id=$1 AND promotion_id=$2 AND active",
 "ORDER BY series_id LIMIT 17"
 ].join(" "),[scope.worldId,scope.promotionId,scope.playerId]);
 if(rows.length>16)throw new Error("Calendar identity limit exceeded");
 return rows.length?rows.map(r=>({seriesId:r.series_id,name:r.name,role:r.role,
  eventType:r.event_type,cadenceWeeks:r.cadence_weeks,
  anchorWeek:r.anchor_week,importance:r.importance,active:r.active,
  earnedPrestige:r.earned_prestige,celebratedEditions:r.celebrated_editions,
  lastCelebratedWeekIndex:r.last_celebrated_week_index,
  posterStyle:r.poster_style})):
  defaults(owned.name,owned.cadence,owned.major_interval??4);
}
async function bootstrap(tx:SqlRows,scope:CalendarScope,owned:Owner){
 const existing=await tx.query<{series_id:string}>(
  "SELECT series_id FROM ppw_show_series WHERE world_id=$1 AND promotion_id=$2 LIMIT 1",
  [scope.worldId,scope.promotionId]);
 if(existing.length)return;
 const seeded=defaults(owned.name,owned.cadence,owned.major_interval??4);
 validateSchedule(seeded);
 // The first edit persists every identity in ONE round-trip, not 2–13
 // independent Neon INSERTs and their network/compute overhead.
 await tx.query([
  "INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,",
  "event_type,cadence_weeks,anchor_week,importance)",
  "SELECT $1,$2,x.series_id,x.name,x.role,x.event_type,x.cadence_weeks,",
  "x.anchor_week,x.importance FROM unnest(",
  "$3::text[],$4::text[],$5::text[],$6::text[],",
  "$7::integer[],$8::integer[],$9::integer[]) AS x(",
  "series_id,name,role,event_type,cadence_weeks,anchor_week,importance)",
  "ON CONFLICT (world_id,promotion_id,series_id) DO NOTHING"
 ].join(" "),[scope.worldId,scope.promotionId,
  seeded.map(s=>s.seriesId),seeded.map(s=>s.name),seeded.map(s=>s.role),
  seeded.map(s=>s.eventType),seeded.map(s=>s.cadenceWeeks),
  seeded.map(s=>s.anchorWeek),seeded.map(s=>s.importance)]);
}
export async function readPromotionCalendar(pool:TransactionPool,scope:CalendarScope){
 return withSqlClient(pool,async tx=>{
  const owned=await owner(tx,scope);
  const series=await load(tx,scope,owned);
  const ownerAnnual=decodeAnnualPremiumSnapshot(owned.annual_plans);
  const ownerPlans=new Map(plansMap(ownerAnnual));
  // No row means legacy recurrence ONLY before a saved World's policy
  // activation year. Once active, the player must explicitly confirm dates:
  // the old fourth-week schedule cannot silently fill another season.
  for(const year of [owned.year,owned.year+1])
   if(year>=owned.premium_plan_start_year&&!ownerPlans.has(year))
    ownerPlans.set(year,[]);
  // Public recurrence only. Never expose a rival promotion's private draft,
  // intended venue, ticket strategy or planned wrestler appearances.
  const rows=await tx.query<{
   promotion_id:string;promotion_name:string;tier:StandingTier;
   management_mode:string;controlled:boolean;cadence:number;
   major_interval:number|null;series_id:string|null;name:string|null;
   role:ShowSeries["role"]|null;event_type:ShowSeries["eventType"]|null;
   cadence_weeks:number|null;anchor_week:number|null;
   importance:number|null;earned_prestige:number|null;
   celebrated_editions:number|null;last_celebrated_week_index:number|null;
   poster_style:string|null;owned_bookings:unknown;annual_plans:unknown;
  }>([
   "SELECT p.promotion_id,p.name AS promotion_name,p.tier,p.management_mode,",
   "EXISTS(SELECT 1 FROM ppw_promotion_controls active_control",
   "WHERE active_control.world_id=p.world_id",
   "AND active_control.promotion_id=p.promotion_id AND active_control.active)",
   "AS controlled,",
   "p.event_cadence_weeks AS cadence,w.major_event_interval_weeks AS major_interval,",
   "s.series_id,s.name,s.role,s.event_type,s.cadence_weeks,s.anchor_week,s.importance,",
   "s.earned_prestige,s.celebrated_editions,s.last_celebrated_week_index,",
    "(SELECT style FROM ppw_kp_series_posters sp WHERE sp.world_id=$1",
    "AND sp.promotion_id=$2 AND s.promotion_id=$2 AND sp.player_id=$4",
    "AND sp.series_id=s.series_id)",
    "AS poster_style,",
   "CASE WHEN row_number() OVER(PARTITION BY p.promotion_id ORDER BY s.series_id)=1",
   "THEN (SELECT coalesce(jsonb_agg(jsonb_build_object('year',plan.year,",
   "'events',plan.events) ORDER BY plan.year),'[]'::jsonb)",
   "FROM ppw_annual_premium_plans plan WHERE plan.world_id=p.world_id",
   "AND plan.promotion_id=p.promotion_id AND plan.year IN(w.year,w.year+1))",
   "END AS annual_plans,",
   "CASE WHEN row_number() OVER(ORDER BY p.promotion_id,s.series_id)=1 THEN",
   "(SELECT coalesce(jsonb_agg(jsonb_build_object(",
   "'draftId',d.draft_id,'year',d.year,'week',d.week,",
   "'bookingClass',d.booking_class,'showSeriesId',d.show_series_id,",
   "'showName',coalesce(d.show_name,'Planned show'),'status',d.status,",
   "'day',d.show_day,'venueName',v.name,'marketName',market.name,",
   "'ready',d.lock_ready_fingerprint IS NOT NULL)",
   "ORDER BY d.year,d.week,d.draft_id),'[]'::jsonb)",
   "FROM (SELECT draft_id,world_id,venue_id,market_id,year,week,",
   "booking_class,show_series_id,show_name,status,show_day,lock_ready_fingerprint",
   "FROM ppw_booking_drafts WHERE world_id=$1 AND promotion_id=$2",
   "AND status IN ('DRAFT','SUBMITTED')",
   "AND (year-1)*52+week-1 BETWEEN $3 AND $3+5",
   "ORDER BY year,week,draft_id LIMIT 13) d",
   "LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id",
   "LEFT JOIN ppw_markets market ON market.world_id=d.world_id",
   "AND market.market_id=d.market_id)",
   "END AS owned_bookings",
   "FROM ppw_promotions p JOIN ppw_worlds w ON w.world_id=p.world_id",
   "LEFT JOIN ppw_show_series s ON s.world_id=p.world_id",
   "AND s.promotion_id=p.promotion_id AND s.active",
   "WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'",
   "ORDER BY p.promotion_id,s.series_id LIMIT 513"
  ].join(" "),[scope.worldId,scope.promotionId,weekIndex(owned.year,owned.week),scope.playerId]);
  if(rows.length>512)throw new Error("World calendar would exceed the read budget");
  const rawBookings=rows.find(row=>Array.isArray(row.owned_bookings))?.owned_bookings;
  if(rawBookings!==undefined&&!Array.isArray(rawBookings))
   throw new Error("Invalid private Calendar bookings");
  const bookingItems=rawBookings??[];
  if(bookingItems.length>12)throw new Error("Calendar bookings exceed six-week budget");
  const bookings:CalendarBooking[]=bookingItems.map((raw:unknown)=>{
   if(!raw||typeof raw!=="object")throw new Error("Invalid Calendar booking");
   const b=raw as Record<string,unknown>;
   if(typeof b.draftId!=="string"||typeof b.year!=="number"||
    typeof b.week!=="number"||
    (b.bookingClass!=="REGULAR"&&b.bookingClass!=="PREMIUM")||
    (b.status!=="DRAFT"&&b.status!=="SUBMITTED")||
    typeof b.showName!=="string"||typeof b.ready!=="boolean"||
    (b.showSeriesId!==null&&typeof b.showSeriesId!=="string")||
    (b.day!==null&&typeof b.day!=="number")||
    (b.venueName!==null&&typeof b.venueName!=="string")||
    (b.marketName!==null&&typeof b.marketName!=="string"))
    throw new Error("Invalid private Calendar booking");
   return {draftId:b.draftId,year:b.year,week:b.week,
    bookingClass:b.bookingClass,showSeriesId:b.showSeriesId,
    showName:b.showName,status:b.status,day:b.day,venueName:b.venueName,
    marketName:b.marketName,ready:b.ready} as CalendarBooking;
  });
  // Fold both years of *public* annual identities into the existing
  // per-promotion World read. Zero additional SQL network round-trips.
  const sharedPlans=new Map<string,Map<number,AnnualPremiumEvent[]>>();
  for(const row of rows){
   if(row.annual_plans===null)continue;
   if(!Array.isArray(row.annual_plans)||row.annual_plans.length>2)
    throw new Error("Invalid public annual plan snapshot");
   const details=new Map<number,AnnualPremiumEvent[]>();
   for(const raw of row.annual_plans){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     !Number.isSafeInteger(raw.year)||!Array.isArray(raw.events)||
     raw.events.length>52)throw new Error("Invalid public event dates");
    const events=raw.events.map((item:unknown)=>{
     if(!item||typeof item!=="object"||Array.isArray(item)||
      typeof (item as {seriesId?:unknown}).seriesId!=="string"||
      !Number.isSafeInteger((item as {week?:unknown}).week))
      throw new Error("Invalid public annual event");
     return item as AnnualPremiumEvent;
    });
    details.set(raw.year,events);
   }
   sharedPlans.set(row.promotion_id,details);
  }
  const promotions=new Map<string,{name:string;tier:StandingTier;
   managementMode:string;controlled:boolean;series:ShowSeries[]}>();
  for(const row of rows){
   let promotion=promotions.get(row.promotion_id);
   if(!promotion){
    promotion={name:row.promotion_name,tier:row.tier,
     managementMode:row.management_mode,controlled:row.controlled,series:[]};
    promotions.set(row.promotion_id,promotion);
   }
   if(row.series_id&&row.name&&row.role&&row.event_type&&
    row.cadence_weeks!==null&&row.anchor_week!==null&&row.importance!==null)
    promotion.series.push({seriesId:row.series_id,name:row.name,role:row.role,
     eventType:row.event_type,cadenceWeeks:row.cadence_weeks,
     anchorWeek:row.anchor_week,importance:row.importance,active:true,
     earnedPrestige:row.earned_prestige??0,
     celebratedEditions:row.celebrated_editions??0,
     lastCelebratedWeekIndex:row.last_celebrated_week_index,
     posterStyle:row.poster_style});
   else if(!promotion.series.length)
    promotion.series=defaults(row.promotion_name,row.cadence,row.major_interval??4);
  }
  const effectiveWorldPlans=new Map<string,Map<number,AnnualPremiumEvent[]>>();
  for(const [id,promotion] of promotions){
   const calendar=new Map(sharedPlans.get(id)??[]);
   for(const year of [owned.year,owned.year+1]){
    if(year<owned.premium_plan_start_year||calendar.has(year))continue;
    // Human ownership always wins, even over a stale AI management flag.
    // True autonomous promotions use the same tier-based annual policy.
    // Preserve the original named WWE/AEW event announcements for an
    // unclaimed fixture, but never fabricate PPVs for an UNASSIGNED generic
    // company with no manager or authorised AI scheduling.
    const original=["WWE","AEW"].includes(promotion.name.trim().toUpperCase());
    const publicSchedule=!promotion.controlled&&
     (promotion.managementMode==="AI"||original);
    calendar.set(year,publicSchedule?
     suggestedAnnualPremiumEvents(promotion.series,promotion.tier,year,promotion.name):[]);
   }
   effectiveWorldPlans.set(id,calendar);
  }
  const start=weekIndex(owned.year,owned.week);
  const worldWeeks=Array.from({length:12},(_,offset)=>{
   const index=start+offset;
   const events=[...promotions].flatMap(([promotionId,promotion])=>
    scheduledSeriesOnWeek(promotion.series,Math.floor(index/52)+1,
     index%52+1,effectiveWorldPlans.get(promotionId)).map(s=>({
     promotionId,promotionName:promotion.name,seriesId:s.seriesId,name:s.name,
     role:s.role,eventType:s.eventType,importance:s.importance
    }))).sort((a,b)=>b.importance-a.importance||
     a.promotionName.localeCompare(b.promotionName)||a.name.localeCompare(b.name));
   return {...dateAt(index),offset,events};
  });
  if(worldWeeks.reduce((total,w)=>total+w.events.length,0)>512)
   throw new Error("World calendar occurrence budget exceeded");
  const annualYears=[owned.year,owned.year+1].map(year=>({
   year,confirmed:ownerAnnual.some(plan=>plan.year===year),
   events:projectYearEvents(series,year,ownerPlans),
   suggested:suggestedAnnualPremiumEvents(series,owned.tier,year,owned.name)
  }));
  return {annual:{tier:owned.tier,policyStartYear:owned.premium_plan_start_year,
   policy:premiumPolicy(owned.tier),
    years:annualYears},worldWeeks,bookings,eventPosterStyle:owned.event_poster,
    broadcastPackage:owned.broadcast_package,promotionId:scope.promotionId,promotionName:owned.name,year:owned.year,week:owned.week,
   worldRevision:Number(owned.revision),canEdit:owned.booking_open,
   series:series.filter(s=>s.active),
   weeks:occurrences(series,weekIndex(owned.year,owned.week),52).map(w=>({
    ...w,shows:scheduledSeriesOnWeek(series,w.year,w.week,ownerPlans)
   }))};
 });
}
export async function upsertPromotionSeries(pool:TransactionPool,input:SeriesMutation){
 validateSeries(input.series);
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"UPSERT_SHOW_SERIES",requiresOpenWeek:true,
  execute:async tx=>{
   const owned=await owner(tx,input);
   if(!owned.booking_open)throw new Error("Calendar is locked");
   await bootstrap(tx,input,owned);
   const before=await load(tx,input,owned);
   const requested=input.series;
   const seriesId=requested.seriesId==="NEW"?"calendar-"+randomUUID():requested.seriesId;
   const record={...requested,seriesId,name:requested.name.trim(),active:true};
   const old=before.find(s=>s.seriesId===seriesId);
   const future=old?await tx.query<{year:number;week:number;booking_class:string}>([
    "SELECT year,week,booking_class FROM ppw_booking_drafts",
    "WHERE world_id=$1 AND promotion_id=$2 AND show_series_id=$3",
    "AND status IN ('DRAFT','SUBMITTED')",
    "AND ((year-1)*52+week-1)>=$4 ORDER BY year,week LIMIT 9"
   ].join(" "),[input.worldId,input.promotionId,seriesId,
    weekIndex(owned.year,owned.week)]):[];
   if(future.length>8)throw new Error("Too many linked future show bookings");
   if(future.some(d=>!seriesDue(record,weekIndex(d.year,d.week))||
     d.booking_class!==(record.eventType==="MAJOR"?"PREMIUM":"REGULAR")))
    throw new Error("Existing planned cards prevent changing this show recurrence or role");
   if(old?.role==="FLAGSHIP"&&record.role!=="FLAGSHIP")
    throw new Error("Flagship cannot be demoted");
   if(old&&old.eventType!==record.eventType){
    const promised=await tx.query<{year:number}>(`
     SELECT year FROM ppw_annual_premium_plans
     WHERE world_id=$1 AND promotion_id=$2 AND year >= $4
      AND events @> jsonb_build_array(jsonb_build_object('seriesId',$3::text))
     ORDER BY year LIMIT 1`,
     [input.worldId,input.promotionId,seriesId,owned.year]);
    if(promised.length)
     throw new Error("A confirmed annual PPV plan uses this show identity; reschedule the year first");
   }
   if(!old&&record.role==="FLAGSHIP")
    throw new Error("Flagship already exists; edit it instead");
   if(!old&&before.some(s=>s.seriesId===seriesId))
    throw new Error("Show identity collision");
   validateSchedule([...before.filter(s=>s.seriesId!==seriesId),record]);
   if(old){
    await tx.query([
     "UPDATE ppw_show_series SET name=$4,role=$5,event_type=$6,cadence_weeks=$7,",
     "anchor_week=$8,importance=$9,active=TRUE WHERE world_id=$1",
     "AND promotion_id=$2 AND series_id=$3"
    ].join(" "),[input.worldId,input.promotionId,seriesId,record.name,record.role,
     record.eventType,record.cadenceWeeks,record.anchorWeek,record.importance]);
   }else{
    await tx.query([
     "INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,",
     "event_type,cadence_weeks,anchor_week,importance) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)"
    ].join(" "),[input.worldId,input.promotionId,seriesId,record.name,
     record.role,record.eventType,record.cadenceWeeks,record.anchorWeek,record.importance]);
   }
   return {seriesId,status:old?"UPDATED":"CREATED"};
  }});
}
export async function archivePromotionSeries(pool:TransactionPool,input:ArchiveSeries){
 if(!validId(input.seriesId))throw new Error("Invalid series identity");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"ARCHIVE_SHOW_SERIES",requiresOpenWeek:true,
  execute:async tx=>{
   const owned=await owner(tx,input);
   if(!owned.booking_open)throw new Error("Calendar is locked");
   await bootstrap(tx,input,owned);
   const before=await load(tx,input,owned);
   const existing=before.find(s=>s.seriesId===input.seriesId&&s.active);
   if(!existing)throw new Error("Active show series not found");
   if(existing.role==="FLAGSHIP")throw new Error("Flagship cannot be archived");
   const promised=await tx.query<{year:number}>(`
    SELECT year FROM ppw_annual_premium_plans
    WHERE world_id=$1 AND promotion_id=$2 AND year >= $4
     AND events @> jsonb_build_array(jsonb_build_object('seriesId',$3::text))
    ORDER BY year LIMIT 1`,
    [input.worldId,input.promotionId,input.seriesId,owned.year]);
   if(promised.length)throw new Error(
    "This event is on a confirmed annual PPV plan; remove its future dates before archiving");
   const booked=await tx.query<{draft_id:string}>([
    "SELECT draft_id FROM ppw_booking_drafts",
    "WHERE world_id=$1 AND promotion_id=$2 AND show_series_id=$3",
    "AND status IN ('DRAFT','SUBMITTED')",
    "AND ((year-1)*52+week-1)>=$4 LIMIT 1"
   ].join(" "),[input.worldId,input.promotionId,input.seriesId,
    weekIndex(owned.year,owned.week)]);
   if(booked.length)throw new Error("Cannot archive a show with booked future cards");
   await tx.query([
    "UPDATE ppw_show_series SET active=FALSE WHERE world_id=$1",
    "AND promotion_id=$2 AND series_id=$3 AND active"
   ].join(" "),[input.worldId,input.promotionId,input.seriesId]);
   return {seriesId:input.seriesId,status:"ARCHIVED"};
  }});
}
