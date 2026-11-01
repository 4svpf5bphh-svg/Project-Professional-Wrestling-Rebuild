/** Private promotion business desk. Original resolved finances only: current
 * canonical balances, paid commitments, settled show receipts and local market
 * strength. Three bounded SQL reads, no cloned finance snapshots or World blob.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {commercialOffers} from "../domain/commercial-offers.js";
import {earnedPromotionIdentity} from "../domain/earned-promotion-identity.js";
import {recentFinanceSql,type FinanceLine,type FinanceEntry} from "./business-financial-activity.js";

export async function readBusinessWorkspace(pool:TransactionPool,scope:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=scope;
 if(![worldId,promotionId,playerId].every(v=>typeof v==="string"&&
  v.length>0&&v.length<=200))throw new Error("Invalid business scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{
   year:number;week:number;revision:number|string;phase:string;name:string;tier:string;kp_style:string|null;
   home_market_name:string|null;media_reach:number|null;
   cash:string;debt:string;weekly_media_income:string|null;
   weekly_sponsor_income:string|null;weekly_fixed_overhead:string|null;
   last_weekly_net:string|null;runway_weeks:number|null;
   financial_distress:string|null;guarantees:string;staff_payroll:string;
   spending_plan:{weeklyWageLimit:number;showTalentLimit:number;cashReserve:number}|null;
   standing_prestige:number|null;standing_fan:number|null;
   standing_business:number|null;standing_talent:number|null;
   standing_year:number|null;
   finance_event_count:number;finance_categories:FinanceLine[];
   finance_recent:FinanceEntry[];
   commercial_deals:{dealId:string;kind:"BROADCAST"|"SPONSOR";offerCode:string;
    weeklyIncome:number;baselineIncome:number;reachIncrease:number;
    startWeekIndex:number;endWeekIndex:number;source:"HUMAN"|"AI"}[];
  }>(`
   SELECT w.year,w.week,w.revision,w.phase,p.name,p.tier,p.cash::text,p.debt::text,
    (SELECT k.style FROM ppw_kp_promotion_styles k WHERE k.world_id=p.world_id
     AND k.promotion_id=p.promotion_id AND k.player_id=$2) AS kp_style,
     p.media_reach,
     (SELECT market.name FROM ppw_markets market
      WHERE market.world_id=p.world_id
       AND market.market_id=p.home_market_id) AS home_market_name,
     p.weekly_media_income::text,p.weekly_sponsor_income::text,
     p.weekly_fixed_overhead::text,p.last_weekly_net::text,
     p.runway_weeks,p.financial_distress,
     standing.prestige AS standing_prestige,
     standing.fan_reputation AS standing_fan,
     standing.business_reputation AS standing_business,
     standing.talent_reputation AS standing_talent,
     standing.last_evaluated_year AS standing_year,
     financial.finance_event_count,financial.finance_categories,financial.finance_recent,
     CASE WHEN plan.world_id IS NULL THEN NULL ELSE jsonb_build_object(
      'weeklyWageLimit',plan.weekly_wage_limit::double precision,
      'showTalentLimit',plan.show_talent_limit::double precision,
      'cashReserve',plan.cash_reserve::double precision) END AS spending_plan,
     COALESCE((SELECT jsonb_agg(to_jsonb(agreement)) FROM (
      SELECT d.deal_id AS "dealId",d.kind,d.offer_code AS "offerCode",
       d.agreed_income::double precision AS "weeklyIncome",
       d.baseline_income::double precision AS "baselineIncome",
       coalesce(d.agreed_reach-d.baseline_reach,0) AS "reachIncrease",
       d.start_week_index AS "startWeekIndex",d.end_week_index AS "endWeekIndex",
       d.source
      FROM ppw_commercial_deals d
      WHERE d.world_id=p.world_id AND d.promotion_id=p.promotion_id
       AND d.status='ACTIVE'
      ORDER BY d.kind,d.deal_id LIMIT 2
     ) agreement),'[]'::jsonb) AS commercial_deals,
     COALESCE((SELECT sum(c.weekly_guarantee)
      FROM ppw_contracts c WHERE c.world_id=p.world_id
       AND c.promotion_id=p.promotion_id AND c.status='SIGNED'
       AND c.start_week_index <= (w.year-1)*52+w.week-1
       AND c.expires_week_index >= (w.year-1)*52+w.week-1),0)::text AS guarantees,
     COALESCE((SELECT sum(e.weekly_salary)
      FROM ppw_staff_employments e WHERE e.world_id=p.world_id
       AND e.promotion_id=p.promotion_id AND e.status='ACTIVE'
       AND e.start_week_index <= (w.year-1)*52+w.week-1\n       AND e.expires_week_index >= (w.year-1)*52+w.week-1),0)::text AS staff_payroll
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=c.promotion_id
    AND p.lifecycle='ACTIVE'
   LEFT JOIN ppw_promotion_standings standing
    ON standing.world_id=p.world_id AND standing.promotion_id=p.promotion_id
   LEFT JOIN ppw_promotion_spending_plans plan
    ON plan.world_id=p.world_id AND plan.promotion_id=p.promotion_id
   ${recentFinanceSql}
   WHERE w.world_id=$1`,[worldId,playerId,promotionId]);
  if(rows.length!==1)throw new Error("Business access denied");
  const w=rows[0]!;
  // A bounded SQL candidate set must never masquerade as a full activity total.
  if(w.finance_event_count>500)throw new Error("Four-week activity exceeds reporting bounds");
  const activity=w.finance_categories;
  const earned=activity.reduce((sum,line)=>sum+Math.max(0,line.amount),0);
  const spent=activity.reduce((sum,line)=>sum+Math.max(0,-line.amount),0);
  const shows=await tx.query<{
   show_id:string;year:number;week:number;
   show_name:string|null;booking_class:string;
   attendance:number;expected_demand:number;
   gate_revenue:string;venue_cost:string;production_cost:string;
   travel_cost:string;appearance_fees:string;total_cost:string;
   net_result:string;incremental_cash:string;crowd_response:string|number;
   creative_workrate:number;creative_spectacle:number;
   creative_stars:number;creative_stories:number;
  }>(`
   SELECT e.show_id,e.year,e.week,d.show_name,d.booking_class,
    e.attendance,e.expected_demand,e.gate_revenue::text,
    e.venue_cost::text,e.production_cost::text,e.travel_cost::text,
    e.appearance_fees::text,e.total_cost::text,e.net_result::text,
    e.incremental_cash::text,cs.crowd_response,
    style.workrate AS creative_workrate,style.spectacle AS creative_spectacle,
    style.stars AS creative_stars,style.stories AS creative_stories
   FROM ppw_show_economics e JOIN ppw_completed_shows cs
    ON cs.world_id=e.world_id AND cs.show_id=e.show_id
   JOIN ppw_booking_drafts d
    ON d.world_id=e.world_id AND d.draft_id=e.show_id
   LEFT JOIN LATERAL (
    SELECT
     count(*) FILTER (WHERE slot.payload->>'intent'
      IN ('TECHNICAL','COMPETITIVE'))::integer AS workrate,
     count(*) FILTER (WHERE slot.payload->>'intent'
      IN ('HIGH_RISK','EPIC'))::integer AS spectacle,
     count(*) FILTER (WHERE slot.payload->>'intent'='SHOWCASE')::integer AS stars,
     count(*) FILTER (WHERE slot.payload->>'intent'
      IN ('STORY','PROTECTIVE'))::integer AS stories
    FROM ppw_card_slots slot
    JOIN ppw_completed_show_matches result
     ON result.world_id=slot.world_id AND result.show_id=slot.draft_id
     AND result.match_id=slot.slot_id
    WHERE slot.world_id=e.world_id AND slot.draft_id=e.show_id
     AND slot.kind='MATCH'
   ) style ON true
   WHERE e.world_id=$1 AND e.promotion_id=$2
   ORDER BY e.year DESC,e.week DESC,e.show_id DESC LIMIT 13`,
   [worldId,promotionId]);
  if(shows.length>13)throw new Error("Event receipt read exceeded limit");
  const territories=await tx.query<{
   market_id:string;name:string;
   awareness:number;live_strength:number;loyalty:number;is_home:boolean;
   rival_name:string|null;rival_live_strength:number|null;
  }>(`
   SELECT s.market_id,m.name,s.awareness,s.live_strength,s.loyalty,
    (p.home_market_id=s.market_id) AS is_home,
    opponent.name AS rival_name,opponent.live_strength AS rival_live_strength
   FROM ppw_promotion_market_states s
   JOIN ppw_markets m ON m.world_id=s.world_id AND m.market_id=s.market_id
   JOIN ppw_promotions p ON p.world_id=s.world_id AND p.promotion_id=s.promotion_id
   LEFT JOIN LATERAL (
    SELECT rival_p.name,rival_s.live_strength
    FROM ppw_promotion_market_states rival_s
    JOIN ppw_promotions rival_p ON rival_p.world_id=rival_s.world_id
     AND rival_p.promotion_id=rival_s.promotion_id AND rival_p.lifecycle='ACTIVE'
    WHERE rival_s.world_id=s.world_id AND rival_s.market_id=s.market_id
     AND rival_s.promotion_id<>s.promotion_id
    ORDER BY rival_s.live_strength DESC,rival_s.promotion_id LIMIT 1
   ) opponent ON true
   WHERE s.world_id=$1 AND s.promotion_id=$2
   ORDER BY is_home DESC,s.live_strength DESC,s.market_id LIMIT 41`,
   [worldId,promotionId]);
  if(territories.length>40)throw new Error("Territory reporting limit reached");
  const number=(v:string|null)=>v===null?null:Number(v);
  const weeklyMedia=number(w.weekly_media_income);
  const weeklySponsor=number(w.weekly_sponsor_income);
  const weeklyOverhead=number(w.weekly_fixed_overhead);
  const guarantees=Number(w.guarantees),staffPayroll=Number(w.staff_payroll);
  const now=(w.year-1)*52+w.week-1;
  const certified=shows.filter(show=>
   (show.year-1)*52+show.week-1>=Math.max(0,now-25)&&
   (show.year-1)*52+show.week-1<=now).slice(0,12);
  const creative=shows.slice(0,12).reduce((a,row)=>{
   const counts=[row.creative_workrate,row.creative_spectacle,
    row.creative_stars,row.creative_stories];
   if(counts.some(n=>!Number.isSafeInteger(n)||n<0))
    throw new Error("Invalid certified match style counts");
   return {workrate:a.workrate+counts[0]!,spectacle:a.spectacle+counts[1]!,
    stars:a.stars+counts[2]!,stories:a.stories+counts[3]!,
    knownMatches:a.knownMatches+counts.reduce((x,y)=>x+y,0),
    completedShows:a.completedShows+(counts.some(n=>n>0)?1:0)};
  },{workrate:0,spectacle:0,stars:0,stories:0,
   knownMatches:0,completedShows:0});
  const creativeIdentity=earnedPromotionIdentity(creative);
  const earnedOffers=commercialOffers({
   tier:w.tier,mediaReach:w.media_reach,weeklyMediaIncome:weeklyMedia,
   weeklySponsorIncome:weeklySponsor,completedShows:certified.length,
   averageCrowd:certified.length?
    certified.reduce((n,show)=>n+Number(show.crowd_response),0)/certified.length:null
  }).filter(offer=>!w.commercial_deals.some(d=>d.kind===offer.kind));
  return {
   name:w.name,tier:w.tier,year:w.year,week:w.week,phase:w.phase,
   kpBrandStyle:w.kp_style,creativeIdentity,
   worldRevision:Number(w.revision),
   homeMarketName:w.home_market_name,mediaReach:w.media_reach,
   standing:w.standing_prestige===null||w.standing_fan===null
    ||w.standing_business===null||w.standing_talent===null
    ||w.standing_year===null?null:{
     prestige:w.standing_prestige,fanReputation:w.standing_fan,
     businessReputation:w.standing_business,talentReputation:w.standing_talent,
     lastEvaluatedYear:w.standing_year
    },
   cash:Number(w.cash),debt:Number(w.debt),
   weeklyMediaIncome:weeklyMedia,weeklySponsorIncome:weeklySponsor,
   weeklyFixedOverhead:weeklyOverhead,weeklyGuarantees:guarantees,
   weeklyStaffPayroll:staffPayroll,
   recurringMargin:weeklyMedia===null||weeklySponsor===null||
    weeklyOverhead===null?null:
    weeklyMedia+weeklySponsor-weeklyOverhead-guarantees-staffPayroll,
   lastWeeklyNet:number(w.last_weekly_net),runwayWeeks:w.runway_weeks,
   financialDistress:w.financial_distress,
   spendingPlan:w.spending_plan,
   commercialAgreements:w.commercial_deals,commercialOffers:earnedOffers,
   rollingFourWeeks:{income:earned,spending:spent,net:earned-spent,
    byCategory:activity},
   recentTransactions:w.finance_recent,
   shows:shows.slice(0,12).map(s=>({
    showId:s.show_id,year:s.year,week:s.week,
    name:s.show_name??(s.booking_class==="PREMIUM"?"Premium event":"Weekly show"),
    bookingClass:s.booking_class,attendance:s.attendance,expectedDemand:s.expected_demand,
    gateRevenue:Number(s.gate_revenue),venueCost:Number(s.venue_cost),
    productionCost:Number(s.production_cost),travelCost:Number(s.travel_cost),
    appearanceFees:Number(s.appearance_fees),totalCost:Number(s.total_cost),
    netResult:Number(s.net_result),incrementalCash:Number(s.incremental_cash)
   })),
   territories:territories.map(t=>({
    marketId:t.market_id,name:t.name,awareness:t.awareness,
    liveStrength:t.live_strength,loyalty:t.loyalty,isHome:t.is_home,
    strongestRival:t.rival_name,rivalLiveStrength:t.rival_live_strength
   }))
  };
 });
}
