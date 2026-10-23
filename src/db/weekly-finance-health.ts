import type {SqlRows} from "./world-operations.js";

/** Finalise original PPW finances ONCE, during the World-locked rollover.
 *
 * Only this week's indexed money events are inspected, independent of World
 * age. Reads no historical shows, whole World blobs or per-wrestler rows.
 * Player-owned queries subsequently read p.last_weekly_net/runway_weeks.
 * World-command rollback/replay makes the changes atomic and exactly once.
 */
export async function settleWeeklyPromotionHealth(
 tx:SqlRows,worldId:string,year:number,week:number,
):Promise<{evaluated:number;distressChanges:number}>{
 const rows=await tx.query<{evaluated:number;distress_changes:number}>(`
  WITH weekly_events AS (
   SELECT (payload->>'promotionId')::text AS promotion_id,
    sum(CASE event_type
      WHEN 'CONTRACT_SIGNED' THEN -COALESCE((payload->>'signingBonus')::bigint,0)
      WHEN 'CONTRACT_EXTRA_DATES_ACCEPTED' THEN -COALESCE((payload->>'additionalPayment')::bigint,0)
      WHEN 'CONTRACT_APPEARANCE_FEES' THEN -COALESCE((payload->>'amount')::bigint,0)
      WHEN 'CONTRACT_GUARANTEE_PAID' THEN -COALESCE((payload->>'amount')::bigint,0)
      WHEN 'CONTRACT_TERMINATED_DURING_RESTRUCTURING'
       THEN -COALESCE((payload->>'settlement')::bigint,0)
      WHEN 'STAFF_BUYOUT' THEN -COALESCE((payload->>'amount')::bigint,0)\n      WHEN 'PROMOTION_RECURRING_FINANCES' THEN COALESCE((payload->>'net')::bigint,0)
      WHEN 'SHOW_EVENT_ECONOMICS' THEN COALESCE((payload->>'incrementalCash')::bigint,0)
      ELSE 0::bigint END)::bigint AS weekly_net
   FROM ppw_ledger_events
   WHERE world_id=$1 AND year=$2 AND week=$3
     AND event_type IN ('CONTRACT_SIGNED','CONTRACT_EXTRA_DATES_ACCEPTED',
      'CONTRACT_APPEARANCE_FEES','CONTRACT_GUARANTEE_PAID',
      'CONTRACT_TERMINATED_DURING_RESTRUCTURING',
      'PROMOTION_RECURRING_FINANCES','SHOW_EVENT_ECONOMICS','STAFF_BUYOUT')
   GROUP BY payload->>'promotionId'
  ), base AS (
   SELECT p.promotion_id,p.cash,p.financial_distress AS old_distress,
    COALESCE(e.weekly_net,0::bigint) AS net
   FROM ppw_promotions p
   LEFT JOIN weekly_events e ON e.promotion_id=p.promotion_id
   WHERE p.world_id=$1 AND p.lifecycle NOT IN ('DORMANT','CLOSED')
     AND p.financial_distress IS NOT NULL
     AND p.weekly_media_income IS NOT NULL
     AND p.weekly_sponsor_income IS NOT NULL
     AND p.weekly_fixed_overhead IS NOT NULL
  ), computed AS (
   SELECT b.*,
    CASE WHEN b.net>=0 THEN NULL::double precision
     WHEN b.cash<=0 THEN 0::double precision
     ELSE round(b.cash::numeric/abs(b.net)::numeric,1)::double precision
    END AS runway
   FROM base b
  ), assessed AS (
   SELECT c.*,
    CASE WHEN c.cash<=0 THEN 'CRISIS'
     WHEN c.net>=0 THEN 'HEALTHY'
     WHEN c.runway>20 THEN 'HEALTHY'
     WHEN c.runway>8 THEN 'WATCH'
     WHEN c.runway>2 THEN 'DISTRESSED'
     ELSE 'CRISIS' END AS new_distress
   FROM computed c
  ), updated AS (
   UPDATE ppw_promotions p SET
    last_weekly_net=a.net,runway_weeks=a.runway,
    financial_distress=a.new_distress
   FROM assessed a WHERE p.world_id=$1 AND p.promotion_id=a.promotion_id
   RETURNING p.promotion_id,p.cash,a.net,a.runway,
    a.old_distress,a.new_distress
  ), changes AS (
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   SELECT $1,$2,$3,'FINANCIAL_DISTRESS_CHANGED',
    jsonb_build_object('promotionId',promotion_id,'from',old_distress,
     'to',new_distress,'cash',cash,'weeklyNet',net,'runwayWeeks',runway)
   FROM updated WHERE old_distress IS DISTINCT FROM new_distress
   RETURNING event_id
  )
  SELECT (SELECT count(*)::integer FROM updated) AS evaluated,
   (SELECT count(*)::integer FROM changes) AS distress_changes
 `,[worldId,year,week]);
 if(rows.length!==1)throw new Error("Weekly finance health settlement failed");
 return {evaluated:rows[0]!.evaluated,distressChanges:rows[0]!.distress_changes};
}
