/** Expire contracts and prepare AI commercial choices inside the existing
 * certified weekly rollover. The canonical recurring-finance SQL has ALREADY
 * paid weekIndex when this runs. New agreements affect only the following week.
 * This module is never a timer or independent scheduler.
 */
import type {SqlRows} from "./world-operations.js";
import {commercialOffers,type CommercialEvidence,type CommercialOffer}
 from "../domain/commercial-offers.js";

export async function settleCommercialWorldWeek(tx:SqlRows,worldId:string,
 year:number,week:number){
 const weekIndex=(year-1)*52+week-1,nextWeek=weekIndex+1;
 if(!worldId||weekIndex<0||week<1||week>52)throw new Error("Invalid commercial settlement");
 // A successful broadcast carries recognition to previously visited
 // away markets, but never fabricates an international audience in an unknown
 // region. A current certified show with real crowd response is required.
 // At most half an awareness point per successful week; the existing market
 // response engine remains the primary source of territory growth.
 const min=(Math.max(0,weekIndex-12)),lowerYear=Math.floor(min/52)+1,
  lowerWeek=min%52+1;
 const gained=await tx.query<{promotion_id:string}>(`
 WITH certified AS (
  SELECT c.promotion_id,avg(c.crowd_response)::double precision AS crowd
  FROM ppw_completed_shows c
  JOIN ppw_show_economics econ ON econ.world_id=c.world_id
   AND econ.show_id=c.show_id AND econ.promotion_id=c.promotion_id
  JOIN ppw_booking_drafts draft ON draft.world_id=c.world_id
   AND draft.draft_id=c.show_id AND draft.status='SUBMITTED'
  WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3
  GROUP BY c.promotion_id
 )
 UPDATE ppw_promotion_market_states s
 SET awareness=least(100.0,s.awareness+
  least(0.5,(certified.crowd-60.0)/30.0))
 FROM certified
 JOIN ppw_promotions p ON p.world_id=$1
  AND p.promotion_id=certified.promotion_id AND p.lifecycle='ACTIVE'
 JOIN ppw_commercial_deals agreement ON agreement.world_id=p.world_id
  AND agreement.promotion_id=p.promotion_id
  AND agreement.kind='BROADCAST' AND agreement.status='ACTIVE'
 WHERE s.world_id=p.world_id AND s.promotion_id=p.promotion_id
  AND s.market_id<>p.home_market_id AND certified.crowd>=66
  AND EXISTS(
   SELECT 1 FROM ppw_completed_shows done
   JOIN ppw_booking_drafts booked ON booked.world_id=done.world_id
    AND booked.draft_id=done.show_id
   WHERE done.world_id=s.world_id AND done.promotion_id=s.promotion_id
    AND booked.market_id=s.market_id
    AND (done.year,done.week)>=($4::integer,$5::integer)
    AND (done.year,done.week)<=($2::integer,$3::integer)
  )
 RETURNING s.promotion_id
 `,[worldId,year,week,lowerYear,lowerWeek]);
 // Modest performance rewards only from certified, submitted shows with
 // actual show economics. Replays insert no new receipts or money movements.
 const bonuses=await tx.query<{promotion_id:string;amount:string}>(`
 WITH certified AS (
  SELECT s.promotion_id,max(s.crowd_response) AS crowd,
   bool_or(EXISTS(
    SELECT 1 FROM ppw_completed_show_matches result
    JOIN ppw_card_slots slot ON slot.world_id=result.world_id
     AND slot.draft_id=result.show_id AND slot.slot_id=result.match_id
     AND slot.kind='MATCH'
    WHERE result.world_id=s.world_id AND result.show_id=s.show_id
     AND slot.payload->>'stipulation'='HARDCORE'
   )) AS hardcore
  FROM ppw_completed_shows s
  JOIN ppw_show_economics e ON e.world_id=s.world_id
   AND e.show_id=s.show_id AND e.promotion_id=s.promotion_id
  JOIN ppw_booking_drafts b ON b.world_id=s.world_id
   AND b.draft_id=s.show_id AND b.status='SUBMITTED'
  WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3
  GROUP BY s.promotion_id
 ), eligible AS (
  SELECT d.world_id,d.deal_id,d.promotion_id,c.crowd,
   round(d.agreed_income*(CASE
    WHEN d.offer_code='SPONSOR_LOCAL' AND c.hardcore THEN .05
    WHEN d.offer_code='BROADCAST_GROWTH' AND c.crowd>=70 THEN .04
    WHEN d.offer_code='BROADCAST_INDIE' AND c.crowd>=66 THEN .04
    WHEN d.offer_code='BROADCAST_TV' AND c.crowd>=76 THEN .03
    WHEN d.offer_code='BROADCAST_GLOBAL' AND c.crowd>=82 THEN .04
    WHEN d.offer_code='SPONSOR_PARTNER' AND c.crowd>=73 THEN .06
    WHEN d.offer_code='SPONSOR_FOOD' AND c.crowd>=72 THEN .04
    WHEN d.offer_code='SPONSOR_TECH' AND c.crowd>=76 THEN .05
    WHEN d.offer_code='SPONSOR_LUXURY' AND c.crowd>=82 THEN .06
    ELSE 0 END))::bigint AS amount
  FROM ppw_commercial_deals d
  JOIN certified c ON c.promotion_id=d.promotion_id
  WHERE d.world_id=$1 AND d.status='ACTIVE'
   AND d.start_week_index<=$4 AND d.end_week_index>=$4
 ), earned AS (
  INSERT INTO ppw_commercial_bonus_receipts(
   world_id,deal_id,promotion_id,year,week,amount,crowd_response)
  SELECT world_id,deal_id,promotion_id,$2,$3,amount,crowd
  FROM eligible WHERE amount>0
  ON CONFLICT DO NOTHING
  RETURNING deal_id,promotion_id,amount
 ), totals AS (
  SELECT promotion_id,sum(amount)::bigint AS amount
  FROM earned GROUP BY promotion_id
 ), paid AS (
  UPDATE ppw_promotions p SET cash=p.cash+totals.amount
  FROM totals WHERE p.world_id=$1 AND p.promotion_id=totals.promotion_id
  RETURNING p.promotion_id,totals.amount::text AS amount
 ), journal AS (
  INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
  SELECT $1,$2,$3,'COMMERCIAL_PERFORMANCE_BONUS',
   jsonb_build_object('promotionId',promotion_id,'dealId',deal_id,'amount',amount)
  FROM earned RETURNING event_id
 )
 SELECT promotion_id,amount FROM paid
 `,[worldId,year,week,weekIndex]);
 // Close the exact ending week's active deals AFTER the week's financial credit.
 // This also restores the original income and reach baselines, without
 // reverting legitimate territory awareness earned while the deal was live.
 const expired=await tx.query<{promotion_id:string;kind:string}>(`
 WITH closing AS (
  UPDATE ppw_commercial_deals d SET status='EXPIRED'
  WHERE d.world_id=$1 AND d.status='ACTIVE' AND d.end_week_index<=$2
  RETURNING d.promotion_id,d.kind,d.baseline_income,d.baseline_reach
 ), aggregate AS (
  SELECT promotion_id,
   max(baseline_income) FILTER(WHERE kind='BROADCAST') AS media,
   max(baseline_income) FILTER(WHERE kind='SPONSOR') AS sponsor,
   max(baseline_reach) FILTER(WHERE kind='BROADCAST') AS reach
  FROM closing GROUP BY promotion_id
 ), restored AS (
  UPDATE ppw_promotions p SET
   weekly_media_income=coalesce(aggregate.media,p.weekly_media_income),
   weekly_sponsor_income=coalesce(aggregate.sponsor,p.weekly_sponsor_income),
   media_reach=coalesce(aggregate.reach,p.media_reach)
  FROM aggregate WHERE p.world_id=$1 AND p.promotion_id=aggregate.promotion_id
  RETURNING p.promotion_id
 )
 SELECT closing.promotion_id,closing.kind FROM closing
 `,[worldId,weekIndex]);
 // Expired terms are published to the already-existing, dismissible
 // Business Wire. One batched journal write only when an agreement actually
 // ends; no recurring Home query, polling, or repeated weekly notice.
 if(expired.length)await tx.query(`
  INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
  SELECT $1,$2,$3,'COMMERCIAL_DEAL_EXPIRED',
   jsonb_build_object('promotionId',deal.promotion_id,'kind',deal.kind)
  FROM jsonb_to_recordset($4::jsonb) AS deal(promotion_id text,kind text)
 `,[worldId,year,week,JSON.stringify(expired)]);
 // One bounded set of AI promotions; recent verified shows only. Separate
 // human-controlled companies are never entered into automatic agreements.
 const owners=await tx.query<CommercialEvidence&{
  promotion_id:string;management_mode:string;active_kinds:string[]
 }>(`
 SELECT p.promotion_id,p.management_mode,p.tier,
  p.media_reach AS "mediaReach",
  p.weekly_media_income::double precision AS "weeklyMediaIncome",
  p.weekly_sponsor_income::double precision AS "weeklySponsorIncome",
  coalesce(recent.completed,0)::integer AS "completedShows",
  recent.crowd::double precision AS "averageCrowd",
  ARRAY(SELECT d.kind FROM ppw_commercial_deals d
   WHERE d.world_id=p.world_id AND d.promotion_id=p.promotion_id
    AND d.status='ACTIVE') AS active_kinds
 FROM ppw_promotions p
 LEFT JOIN LATERAL (
  SELECT count(*)::integer AS completed,avg(crowd_response) AS crowd
  FROM (
   SELECT show.year,show.week,show.crowd_response FROM ppw_completed_shows show
   JOIN ppw_show_economics econ ON econ.world_id=show.world_id
    AND econ.show_id=show.show_id AND econ.promotion_id=show.promotion_id
   JOIN ppw_booking_drafts draft ON draft.world_id=show.world_id
    AND draft.draft_id=show.show_id AND draft.status='SUBMITTED'
   WHERE show.world_id=p.world_id AND show.promotion_id=p.promotion_id
   ORDER BY show.year DESC,show.week DESC,show.show_id DESC LIMIT 12
  ) last_twelve
  WHERE (last_twelve.year-1)*52+last_twelve.week-1>=greatest(0,$2-25)
 ) recent ON TRUE
 WHERE p.world_id=$1 AND p.management_mode='AI'
  AND p.lifecycle='ACTIVE'
  AND NOT EXISTS(SELECT 1 FROM ppw_promotion_controls control
   WHERE control.world_id=p.world_id AND control.promotion_id=p.promotion_id
    AND control.active)
 ORDER BY p.promotion_id LIMIT 129
 `,[worldId,nextWeek]);
 if(owners.length>128)throw new Error("AI commercial batch bound exceeded");
 type Proposal={deal_id:string;promotion_id:string;kind:string;offer_code:string;
  baseline_income:number;agreed_income:number;baseline_reach:number|null;
  agreed_reach:number|null;start_week_index:number;end_week_index:number;source:"AI"};
 const proposals:Proposal[]=[];
 for(const p of owners){
  const offers=commercialOffers(p);
  for(const kind of ["BROADCAST","SPONSOR"] as const){
   if(p.active_kinds.includes(kind))continue;
   const eligible=offers.filter(o=>o.kind===kind);
   // AI promotions pursue stronger guaranteed income after sustained
   // high-quality shows, otherwise a conservative short term.
   const choice:CommercialOffer|undefined=kind==="BROADCAST"?
    (eligible.find(o=>o.code==="BROADCAST_TV")??
     eligible.find(o=>o.code==="BROADCAST_STABLE")):
    (eligible.find(o=>o.code==="SPONSOR_PARTNER")??
     eligible.find(o=>o.code==="SPONSOR_LOCAL"));
   if(!choice)continue;
   const baseline=kind==="BROADCAST"?p.weeklyMediaIncome:p.weeklySponsorIncome;
   if(baseline===null)continue;
   const originalReach=kind==="BROADCAST"?p.mediaReach:null;
   proposals.push({deal_id:"ai-commercial-"+p.promotion_id+"-"+nextWeek+"-"+kind,
    promotion_id:p.promotion_id,kind,offer_code:choice.code,
    baseline_income:baseline,agreed_income:choice.weeklyIncome,
    baseline_reach:originalReach,
    agreed_reach:originalReach===null?null:originalReach+choice.reachIncrease,
    start_week_index:nextWeek,end_week_index:nextWeek+choice.termWeeks-1,source:"AI"});
  }
 }
 if(proposals.length){
  // Insert strictly before applying amounts; WHERE status active filters out
  // any conflicting proposal. The World lock prevents parallel settlements.
  const signed=await tx.query<{promotion_id:string;kind:string;
   agreed_income:string;agreed_reach:number|null}>(`
   INSERT INTO ppw_commercial_deals(world_id,deal_id,promotion_id,kind,offer_code,
    status,baseline_income,agreed_income,baseline_reach,agreed_reach,
    start_week_index,end_week_index,source)
   SELECT $1,x.deal_id,x.promotion_id,x.kind,x.offer_code,'ACTIVE',
    x.baseline_income,x.agreed_income,x.baseline_reach,x.agreed_reach,
    x.start_week_index,x.end_week_index,x.source
   FROM jsonb_to_recordset($2::jsonb) AS x(
    deal_id text,promotion_id text,kind text,offer_code text,
    baseline_income bigint,agreed_income bigint,baseline_reach double precision,
    agreed_reach double precision,start_week_index integer,end_week_index integer,
    source text)
   ON CONFLICT DO NOTHING
   RETURNING promotion_id,kind,agreed_income::text,agreed_reach
  `,[worldId,JSON.stringify(proposals)]);
  if(signed.length!==proposals.length)throw new Error("AI commercial agreements conflicted");
  await tx.query(`
   UPDATE ppw_promotions p SET
    weekly_media_income=coalesce(ai.media,p.weekly_media_income),
    weekly_sponsor_income=coalesce(ai.sponsor,p.weekly_sponsor_income),
    media_reach=coalesce(ai.reach,p.media_reach)
   FROM (
    SELECT promotion_id,
     max(agreed_income::bigint) FILTER(WHERE kind='BROADCAST') AS media,
     max(agreed_income::bigint) FILTER(WHERE kind='SPONSOR') AS sponsor,
     max(agreed_reach) FILTER(WHERE kind='BROADCAST') AS reach
    FROM ppw_commercial_deals
    WHERE world_id=$1 AND status='ACTIVE' AND source='AI'
     AND start_week_index=$2
    GROUP BY promotion_id
   ) ai
   WHERE p.world_id=$1 AND p.promotion_id=ai.promotion_id
  `,[worldId,nextWeek]);
 }
 if(expired.length||proposals.length||gained.length||bonuses.length)await tx.query(`
  INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
  VALUES($1,$2,$3,'COMMERCIAL_WEEK_SETTLED',
   jsonb_build_object('expired',$4::integer,'newAiDeals',$5::integer,'earnedMarkets',$6::integer))
 `,[worldId,year,week,expired.length,proposals.length,gained.length]);
 return {expired:expired.length,aiDeals:proposals.length,earnedMarkets:gained.length,
  bonusPromotions:bonuses.length};
}
