/** Authenticated, compact calendar identity editing and 26-week projection.
 * Recurrence is calculated from a handful of series rows; no World hydration,
 * polling, materialized occurrence rows or second World Lock timer.
 */
import {randomUUID} from "node:crypto";
import {withSqlClient} from "./postgres.js";
import {applyWorldCommand} from "./world-commands.js";
import type {SqlRows} from "./world-operations.js";
import type {TransactionPool} from "./transaction.js";
import {defaults,occurrences,validateSchedule,validateSeries,weekIndex,
 type ShowSeries} from "../domain/show-calendar.js";
export interface CalendarScope {worldId:string;promotionId:string;playerId:string}
export interface SeriesMutation extends CalendarScope {
 requestId:string;expectedRevision:number;series:ShowSeries;
}
export interface ArchiveSeries extends CalendarScope {
 requestId:string;expectedRevision:number;seriesId:string;
}
type Owner={name:string;year:number;week:number;revision:string|number;
 booking_open:boolean;cadence:number;major_interval:number|null};
type Row={series_id:string;name:string;role:ShowSeries["role"];
 event_type:ShowSeries["eventType"];cadence_weeks:number;anchor_week:number;
 importance:number;active:boolean};
const validId=(s:unknown):s is string=>
 typeof s==="string"&&s.trim().length>0&&s.length<=200;
async function owner(tx:SqlRows,scope:CalendarScope):Promise<Owner>{
 if(![scope.worldId,scope.promotionId,scope.playerId].every(validId))
  throw new Error("Invalid show calendar identity");
 const rows=await tx.query<Owner>([
 "SELECT p.name,w.year,w.week,w.revision,",
 "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open,",
 "p.event_cadence_weeks AS cadence,w.major_event_interval_weeks AS major_interval",
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
 "SELECT series_id,name,role,event_type,cadence_weeks,anchor_week,importance,active",
 "FROM ppw_show_series WHERE world_id=$1 AND promotion_id=$2",
 "ORDER BY series_id LIMIT 25"
 ].join(" "),[scope.worldId,scope.promotionId]);
 if(rows.length>24)throw new Error("Calendar identity limit exceeded");
 return rows.length?rows.map(r=>({seriesId:r.series_id,name:r.name,role:r.role,
  eventType:r.event_type,cadenceWeeks:r.cadence_weeks,
  anchorWeek:r.anchor_week,importance:r.importance,active:r.active})):
  defaults(owned.name,owned.cadence,owned.major_interval??4);
}
async function bootstrap(tx:SqlRows,scope:CalendarScope,owned:Owner){
 const existing=await tx.query<{series_id:string}>(
  "SELECT series_id FROM ppw_show_series WHERE world_id=$1 AND promotion_id=$2 LIMIT 1",
  [scope.worldId,scope.promotionId]);
 if(existing.length)return;
 for(const s of defaults(owned.name,owned.cadence,owned.major_interval??4)){
  await tx.query([
   "INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,event_type,",
   "cadence_weeks,anchor_week,importance) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
   "ON CONFLICT (world_id,promotion_id,series_id) DO NOTHING"
  ].join(" "),[scope.worldId,scope.promotionId,s.seriesId,s.name,s.role,
   s.eventType,s.cadenceWeeks,s.anchorWeek,s.importance]);
 }
}
export async function readPromotionCalendar(pool:TransactionPool,scope:CalendarScope){
 return withSqlClient(pool,async tx=>{
  const owned=await owner(tx,scope);
  const series=await load(tx,scope,owned);
  return {promotionName:owned.name,year:owned.year,week:owned.week,
   worldRevision:Number(owned.revision),canEdit:owned.booking_open,
   series:series.filter(s=>s.active),
   weeks:occurrences(series,weekIndex(owned.year,owned.week),26)};
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
   if(old?.role==="FLAGSHIP"&&record.role!=="FLAGSHIP")
    throw new Error("Flagship cannot be demoted");
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
   await tx.query([
    "UPDATE ppw_show_series SET active=FALSE WHERE world_id=$1",
    "AND promotion_id=$2 AND series_id=$3 AND active"
   ].join(" "),[input.worldId,input.promotionId,input.seriesId]);
   return {seriesId:input.seriesId,status:"ARCHIVED"};
  }});
}
