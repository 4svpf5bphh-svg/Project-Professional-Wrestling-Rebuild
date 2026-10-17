/** Original market awareness, live strength and loyalty, after ALL
 * current-week show results are certified. Batched World-locked update.
 * Deterministic even when shows resolve in different asynchronous order.
 */
import type {SqlRows} from "./world-operations.js";
import {originalMarketAfterEvent} from "../domain/legacy-market-drift.js";
import type {EventType,LocalAudience} from "../domain/legacy-show-economics.js";

export async function settleWeekLocalMarkets(
 tx:SqlRows,worldId:string,year:number,week:number,
):Promise<{affected:number}>{
 const enabled=await tx.query<{show_economics_enabled:boolean}>(`
 SELECT show_economics_enabled FROM ppw_worlds
 WHERE world_id=$1 AND year=$2 AND week=$3 AND phase='RESOLVING'`,
 [worldId,year,week]);
 if(enabled.length!==1)throw new Error("World is not resolving market responses");
 if(!enabled[0]!.show_economics_enabled)return {affected:0};
 const shows=await tx.query<{
  show_id:string;promotion_id:string;market_id:string|null;
  home_market_id:string|null;event_type:EventType|null;
  show_day:number|null;expected_demand:number;attendance:number;
  capacity:number|null;average_match_rating:string|null;crowd_response:string;
  awareness:number|null;live_strength:number|null;loyalty:number|null;
 }>(`
 SELECT e.show_id,e.promotion_id,d.market_id,p.home_market_id,
  d.event_type,d.show_day,e.expected_demand,e.attendance,
  v.capacity,e.average_match_rating::text,cs.crowd_response::text,
  s.awareness,s.live_strength,s.loyalty
 FROM ppw_show_economics e
 JOIN ppw_booking_drafts d ON d.world_id=e.world_id AND d.draft_id=e.show_id
  AND d.status='SUBMITTED'
 JOIN ppw_promotions p ON p.world_id=e.world_id
  AND p.promotion_id=e.promotion_id AND p.lifecycle='ACTIVE'
 JOIN ppw_completed_shows cs ON cs.world_id=e.world_id AND cs.show_id=e.show_id
 LEFT JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
 LEFT JOIN ppw_promotion_market_states s ON s.world_id=d.world_id
  AND s.promotion_id=e.promotion_id AND s.market_id=d.market_id
 WHERE e.world_id=$1 AND e.year=$2 AND e.week=$3
 ORDER BY d.show_day,e.promotion_id,e.show_id LIMIT 257`,
 [worldId,year,week]);
 if(shows.length>256)throw new Error("World market response batch limit exceeded");
 const map=new Map<string,{promotion:string;market:string;local:LocalAudience}>();
 for(const show of shows){
  if(!show.market_id||!show.home_market_id||!show.event_type||
   show.show_day===null||show.average_match_rating===null||
   show.capacity===null||show.awareness===null||
   show.live_strength===null||show.loyalty===null)
   throw new Error("Original market response evidence missing");
  const key=show.promotion_id+"\u0000"+show.market_id;
  const existing=map.get(key);
  const before=existing?.local??{awareness:show.awareness,
   liveStrength:show.live_strength,loyalty:show.loyalty};
  const after=originalMarketAfterEvent(before,{
   eventType:show.event_type,isHomeMarket:show.market_id===show.home_market_id,
   expectedDemand:show.expected_demand,attendance:show.attendance,
   capacity:show.capacity,averageMatchRating:Number(show.average_match_rating),
   crowdResponse:Number(show.crowd_response)});
  map.set(key,{promotion:show.promotion_id,market:show.market_id,local:after});
 }
 if(!map.size)return {affected:0};
 const rows=[...map.values()].map(r=>({
  promotion:r.promotion,market:r.market,
  awareness:r.local.awareness,live_strength:r.local.liveStrength,loyalty:r.local.loyalty,
 }));
 const updated=await tx.query<{promotion_id:string}>(`
 UPDATE ppw_promotion_market_states s SET
  awareness=v.awareness,live_strength=v.live_strength,loyalty=v.loyalty
 FROM jsonb_to_recordset($2::jsonb) AS v(
  promotion text,market text,awareness double precision,
  live_strength double precision,loyalty double precision)
 WHERE s.world_id=$1 AND s.promotion_id=v.promotion AND s.market_id=v.market
 RETURNING s.promotion_id`,
 [worldId,JSON.stringify(rows)]);
 if(updated.length!==rows.length)throw new Error("Incomplete original market update");
 // One compact World-week audit event, not one extra large projection per show.
 await tx.query(`
 INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
 VALUES($1,$2,$3,'SHOW_MARKET_RESPONSE_SETTLED',
  jsonb_build_object('territories',$4::integer,'shows',$5::integer))`,
 [worldId,year,week,rows.length,shows.length]);
 return {affected:rows.length};
}
