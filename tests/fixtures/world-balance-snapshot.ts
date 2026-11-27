import {type TransactionPool,withWorldTransaction} from "../../src/db/transaction.js";

/** Quarterly diagnostics over disposable Worlds only. All results come from
 * the normal production settlement tables after the certified week publishes.
 */
export async function captureBalanceSnapshot(pool:TransactionPool,world:string,weeks:number){
 const year=Math.floor(Math.max(0,weeks-1)/52)+1;
 const end=(weeks-1)%52+1;
 const start=Math.max(1,end-12);
 return withWorldTransaction(pool,async tx=>{
  const promotions=await tx.query(`
   WITH events AS (
    SELECT e.promotion_id,count(*) AS shows,count(*) FILTER(WHERE d.booking_class='REGULAR') AS regular_shows,
     sum(e.venue_cost) AS venue_cost,sum(e.production_cost) AS production_cost,
     sum(e.travel_cost) AS travel_cost,
     sum(e.gate_revenue) AS gate,sum(e.total_cost) AS event_cost,
     sum(e.appearance_fees) AS appearance,
     avg(e.attendance)::integer AS attendance,
     round(avg(e.attendance::numeric/nullif(v.capacity,0)),3) AS occupancy,
     avg(e.tv_household_rating) AS avg_tv,min(e.tv_household_rating) AS min_tv,
     max(e.tv_household_rating) AS max_tv,avg(e.ppv_buys)::bigint AS avg_buys,
     count(e.ppv_buys) AS ppvs,sum(e.ppv_buys) AS ppv_buys
    FROM ppw_show_economics e
    JOIN ppw_booking_drafts d ON (d.world_id,d.draft_id)=(e.world_id,e.show_id)
    LEFT JOIN ppw_venues v ON (v.world_id,v.venue_id)=(d.world_id,d.venue_id)
    WHERE e.world_id=$1 AND e.year=$2 AND e.week BETWEEN $3 AND $4
    GROUP BY e.promotion_id
   ), ledger AS (
    SELECT payload->>'promotionId' AS promotion_id,
     sum((payload->>'mediaIncome')::bigint) AS media,
     sum((payload->>'sponsorIncome')::bigint) AS sponsor,
     sum((payload->>'fixedOverhead')::bigint) AS overhead,
     sum((payload->>'staffCost')::bigint) AS staff,
     sum((payload->>'amount')::bigint) FILTER(WHERE event_type='CONTRACT_GUARANTEE_PAID') AS guarantees,
     sum((payload->>'amount')::bigint) FILTER(WHERE event_type='COMMERCIAL_PERFORMANCE_BONUS') AS bonus,
     sum((payload->>'amount')::bigint) FILTER(WHERE event_type='CONTRACT_APPEARANCE_FEES') AS charged_appearances,
     sum(CASE event_type
      WHEN 'CONTRACT_SIGNED' THEN (payload->>'signingBonus')::bigint
      WHEN 'CONTRACT_EXTRA_DATES_ACCEPTED' THEN (payload->>'additionalPayment')::bigint
      WHEN 'CONTRACT_TERMINATED_DURING_RESTRUCTURING' THEN (payload->>'settlement')::bigint
      WHEN 'STAFF_BUYOUT' THEN (payload->>'amount')::bigint ELSE 0 END) AS one_off_cost,
     count(*) FILTER(WHERE event_type='PROMOTION_RESTRUCTURED') AS restructures,
     count(*) FILTER(WHERE event_type='PROMOTION_RECOVERED_FROM_DISTRESS') AS recoveries,
     count(*) FILTER(WHERE event_type='COMMERCIAL_DEAL_EXPIRED' AND payload->>'kind'='BROADCAST') AS tv_expiries
    FROM ppw_ledger_events
    WHERE world_id=$1 AND year=$2 AND week BETWEEN $3 AND $4
     AND event_type IN ('PROMOTION_RECURRING_FINANCES','CONTRACT_GUARANTEE_PAID',
      'COMMERCIAL_PERFORMANCE_BONUS','COMMERCIAL_DEAL_EXPIRED',
      'CONTRACT_APPEARANCE_FEES','CONTRACT_SIGNED','CONTRACT_EXTRA_DATES_ACCEPTED',
      'CONTRACT_TERMINATED_DURING_RESTRUCTURING','STAFF_BUYOUT',
      'PROMOTION_RESTRUCTURED','PROMOTION_RECOVERED_FROM_DISTRESS')
    GROUP BY payload->>'promotionId'
   )
   SELECT p.promotion_id,p.tier,p.lifecycle,p.cash,p.debt,p.financial_distress,
    p.media_reach,s.prestige,m.awareness,m.live_strength,m.loyalty,
    a.shows,a.regular_shows,a.gate,a.event_cost,a.venue_cost,a.production_cost,a.travel_cost,a.appearance,a.attendance,a.occupancy,
    a.avg_tv,a.min_tv,a.max_tv,a.ppvs,a.avg_buys,a.ppv_buys,l.media,l.sponsor,l.overhead,
    l.staff,l.guarantees,l.bonus,l.tv_expiries,l.charged_appearances,l.one_off_cost,l.restructures,l.recoveries,
    (SELECT count(DISTINCT c.person_id) FROM ppw_contracts c
     WHERE c.world_id=$1 AND c.promotion_id=p.promotion_id AND c.status='SIGNED'
      AND $5 BETWEEN c.start_week_index AND c.expires_week_index) AS roster,
    (SELECT count(*) FROM ppw_championship_reigns r
     JOIN ppw_championships c USING(world_id,championship_id)
     WHERE r.world_id=$1 AND c.promotion_id=p.promotion_id) AS reigns
   FROM ppw_promotions p LEFT JOIN events a USING(promotion_id)
   LEFT JOIN ledger l USING(promotion_id)
   LEFT JOIN ppw_promotion_standings s USING(world_id,promotion_id)
   LEFT JOIN ppw_promotion_market_states m ON m.world_id=p.world_id
    AND m.promotion_id=p.promotion_id AND m.market_id=p.home_market_id
   WHERE p.world_id=$1 ORDER BY p.promotion_id
  `,[world,year,start,end,weeks]);
  const careers=await tx.query(`
   SELECT career_stage,booking_division,count(*) AS active,
    count(*) FILTER(WHERE generated_talent) AS prospects_generated,
    count(*) FILTER(WHERE NOT EXISTS(
     SELECT 1 FROM ppw_contracts c WHERE c.world_id=p.world_id
      AND c.person_id=p.person_id AND c.status='SIGNED'
      AND $2 BETWEEN c.start_week_index AND c.expires_week_index)) AS free_agents,
    percentile_cont(ARRAY[0,.1,.5,.9,1]) WITHIN GROUP(ORDER BY momentum) AS momentum,
    percentile_cont(ARRAY[0,.1,.5,.9,1]) WITHIN GROUP(ORDER BY popularity) AS popularity,
    percentile_cont(ARRAY[0,.1,.5,.9,1]) WITHIN GROUP(ORDER BY recognition) AS recognition,
    percentile_cont(ARRAY[0,.1,.5,.9,1]) WITHIN GROUP(ORDER BY biological_age) AS age,
    percentile_cont(ARRAY[0,.1,.5,.9,1]) WITHIN GROUP(ORDER BY in_ring_quality) AS ring
   FROM ppw_people p WHERE world_id=$1 AND status='ACTIVE'
   GROUP BY career_stage,booking_division ORDER BY career_stage,booking_division
  `,[world,weeks]);
  const [population]=await tx.query(`
   SELECT (SELECT count(*) FROM ppw_people WHERE world_id=$1 AND status='RETIRED') AS retired,
    (SELECT count(*) FROM ppw_medical_absences
     WHERE world_id=$1 AND status='ACTIVE') AS unavailable,
    (SELECT count(*) FROM ppw_ledger_events WHERE world_id=$1) AS ledger_rows,
    (SELECT count(*) FROM ppw_contracts WHERE world_id=$1) AS contract_rows
  `,[world]);
  const injuries=await tx.query(`
   SELECT incident->>'injury_severity' AS severity,count(*) AS incidents,
    sum((incident->>'injury_weeks_out')::integer) AS weeks_out
   FROM ppw_completed_shows s JOIN ppw_completed_match_report_facts f USING(world_id,show_id)
   CROSS JOIN LATERAL jsonb_array_elements(f.injuries_json) incident
   WHERE s.world_id=$1 AND s.year=$2 AND s.week BETWEEN $3 AND $4
   GROUP BY 1 ORDER BY 1
  `,[world,year,start,end]);
  return {world,weeks,promotions,careers,population,injuries};
 });
}
