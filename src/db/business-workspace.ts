/** Private promotion business desk. Original resolved finances only: current
 * canonical balances, paid commitments, settled show receipts and local market
 * strength. Three bounded SQL reads, no cloned finance snapshots or World blob.
 */
import type {TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";

export async function readBusinessWorkspace(pool:TransactionPool,scope:{
 worldId:string;promotionId:string;playerId:string
}){
 const {worldId,promotionId,playerId}=scope;
 if(![worldId,promotionId,playerId].every(v=>typeof v==="string"&&
  v.length>0&&v.length<=200))throw new Error("Invalid business scope");
 return withSqlClient(pool,async tx=>{
  const rows=await tx.query<{
   year:number;week:number;phase:string;name:string;tier:string;
   cash:string;debt:string;weekly_media_income:string|null;
   weekly_sponsor_income:string|null;weekly_fixed_overhead:string|null;
   last_weekly_net:string|null;runway_weeks:number|null;
   financial_distress:string|null;guarantees:string;
  }>(`
   SELECT w.year,w.week,w.phase,p.name,p.tier,p.cash::text,p.debt::text,
     p.weekly_media_income::text,p.weekly_sponsor_income::text,
     p.weekly_fixed_overhead::text,p.last_weekly_net::text,
     p.runway_weeks,p.financial_distress,
     COALESCE((SELECT sum(c.weekly_guarantee)
      FROM ppw_contracts c WHERE c.world_id=p.world_id
       AND c.promotion_id=p.promotion_id AND c.status='SIGNED'
       AND c.start_week_index <= (w.year-1)*52+w.week-1
       AND c.expires_week_index >= (w.year-1)*52+w.week-1),0)::text AS guarantees
   FROM ppw_worlds w JOIN ppw_promotion_controls c
    ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active
   JOIN ppw_memberships m ON m.world_id=w.world_id
    AND m.player_id=c.player_id AND m.status='ACTIVE'
   JOIN ppw_promotions p ON p.world_id=w.world_id AND p.promotion_id=c.promotion_id
    AND p.lifecycle='ACTIVE'
   WHERE w.world_id=$1`,[worldId,playerId,promotionId]);
  if(rows.length!==1)throw new Error("Business access denied");
  const w=rows[0]!;
  const shows=await tx.query<{
   show_id:string;year:number;week:number;
   show_name:string|null;booking_class:string;
   attendance:number;expected_demand:number;
   gate_revenue:string;venue_cost:string;production_cost:string;
   travel_cost:string;appearance_fees:string;total_cost:string;
   net_result:string;incremental_cash:string;
  }>(`
   SELECT e.show_id,e.year,e.week,d.show_name,d.booking_class,
    e.attendance,e.expected_demand,e.gate_revenue::text,
    e.venue_cost::text,e.production_cost::text,e.travel_cost::text,
    e.appearance_fees::text,e.total_cost::text,e.net_result::text,
    e.incremental_cash::text
   FROM ppw_show_economics e JOIN ppw_booking_drafts d
    ON d.world_id=e.world_id AND d.draft_id=e.show_id
   WHERE e.world_id=$1 AND e.promotion_id=$2
   ORDER BY e.year DESC,e.week DESC,e.show_id DESC LIMIT 13`,
   [worldId,promotionId]);
  if(shows.length>13)throw new Error("Event receipt read exceeded limit");
  const territories=await tx.query<{
   market_id:string;name:string;
   awareness:number;live_strength:number;loyalty:number;is_home:boolean;
  }>(`
   SELECT s.market_id,m.name,s.awareness,s.live_strength,s.loyalty,
    (p.home_market_id=s.market_id) AS is_home
   FROM ppw_promotion_market_states s
   JOIN ppw_markets m ON m.world_id=s.world_id AND m.market_id=s.market_id
   JOIN ppw_promotions p ON p.world_id=s.world_id AND p.promotion_id=s.promotion_id
   WHERE s.world_id=$1 AND s.promotion_id=$2
   ORDER BY is_home DESC,s.live_strength DESC,s.market_id LIMIT 41`,
   [worldId,promotionId]);
  if(territories.length>40)throw new Error("Territory reporting limit reached");
  const number=(v:string|null)=>v===null?null:Number(v);
  const weeklyMedia=number(w.weekly_media_income);
  const weeklySponsor=number(w.weekly_sponsor_income);
  const weeklyOverhead=number(w.weekly_fixed_overhead);
  const guarantees=Number(w.guarantees);
  return {
   name:w.name,tier:w.tier,year:w.year,week:w.week,phase:w.phase,
   cash:Number(w.cash),debt:Number(w.debt),
   weeklyMediaIncome:weeklyMedia,weeklySponsorIncome:weeklySponsor,
   weeklyFixedOverhead:weeklyOverhead,weeklyGuarantees:guarantees,
   recurringMargin:weeklyMedia===null||weeklySponsor===null||
    weeklyOverhead===null?null:
    weeklyMedia+weeklySponsor-weeklyOverhead-guarantees,
   lastWeeklyNet:number(w.last_weekly_net),runwayWeeks:w.runway_weeks,
   financialDistress:w.financial_distress,
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
    liveStrength:t.live_strength,loyalty:t.loyalty,isHome:t.is_home
   }))
  };
 });
}
