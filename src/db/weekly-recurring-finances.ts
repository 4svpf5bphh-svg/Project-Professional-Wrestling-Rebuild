/** The exact original weekly payroll and recurring-finance postings.
 * Called exactly once from certified World advancement. Extracted so a
 * disposable multi-season test can exercise the same production SQL.
 * This adds no queries, stages or independent World advancement.
 */
import type {SqlRows} from "./world-operations.js";
export async function settleRecurringWorldFinances(
 tx:SqlRows,worldId:string,year:number,week:number,
){
 const weekIndex=(year-1)*52+week-1;
 if(!worldId||!Number.isSafeInteger(weekIndex)||weekIndex<0||
  week<1||week>52)throw new Error("Invalid weekly recurring finance context");
      // Original PPW charges wages even if limited dates are exhausted.
      // One grouped debit and ledger insert, regardless of roster size.
      await tx.query(`
        WITH payroll AS (
          SELECT c.promotion_id,sum(c.weekly_guarantee)::bigint AS amount
          FROM ppw_contracts c JOIN ppw_promotions active_p
            ON active_p.world_id=c.world_id AND active_p.promotion_id=c.promotion_id
           WHERE c.world_id=$1 AND c.status='SIGNED'
            AND active_p.lifecycle NOT IN ('DORMANT','CLOSED')
            AND c.start_week_index<=$4 AND c.expires_week_index>=$4
          GROUP BY c.promotion_id
        ), charged AS (
          UPDATE ppw_promotions p SET cash=p.cash-payroll.amount
          FROM payroll WHERE p.world_id=$1 AND p.promotion_id=payroll.promotion_id
          RETURNING p.promotion_id,payroll.amount
        )
        INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
        SELECT $1,$2,$3,'CONTRACT_GUARANTEE_PAID',
          jsonb_build_object('promotionId',promotion_id,'amount',amount)
        FROM charged`,[worldId,year,week,weekIndex]);
      // Original packages/sim-core/src/finance.ts settles recurring media,
      // sponsors and overhead once per completed week, excluding dormant/
      // closed promotions. Only populated ORIGINAL economic profiles qualify;
      // NULL fixtures never receive fabricated finance values. One write
      // updates all promotions and records compact category totals, not a
      // historical financial-transaction row per category and promotion.
      await tx.query(`
        WITH staff AS (
         SELECT promotion_id,sum(weekly_salary)::bigint AS amount
         FROM ppw_staff_employments WHERE world_id=$1 AND status='ACTIVE'
          AND start_week_index<=$4 AND expires_week_index>=$4
         GROUP BY promotion_id
        ), costs AS (
         SELECT p0.promotion_id,COALESCE(s.amount,0::bigint) AS staff_cost
         FROM ppw_promotions p0 LEFT JOIN staff s ON s.promotion_id=p0.promotion_id
         WHERE p0.world_id=$1
        ), credited AS (
         UPDATE ppw_promotions p SET
          cash=p.cash+p.weekly_media_income+p.weekly_sponsor_income
           -p.weekly_fixed_overhead-costs.staff_cost
         FROM costs WHERE p.world_id=$1 AND p.promotion_id=costs.promotion_id
           AND p.lifecycle NOT IN ('DORMANT','CLOSED')
           AND p.weekly_media_income IS NOT NULL
           AND p.weekly_sponsor_income IS NOT NULL
           AND p.weekly_fixed_overhead IS NOT NULL
         RETURNING p.promotion_id,p.weekly_media_income,p.weekly_sponsor_income,
           p.weekly_fixed_overhead,costs.staff_cost
        )
        INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
         SELECT $1,$2,$3,'PROMOTION_RECURRING_FINANCES',
          jsonb_build_object('promotionId',promotion_id,
           'mediaIncome',weekly_media_income,'sponsorIncome',weekly_sponsor_income,
           'fixedOverhead',weekly_fixed_overhead,'staffCost',staff_cost,
           'net',weekly_media_income+weekly_sponsor_income-weekly_fixed_overhead-staff_cost)
         FROM credited`,[worldId,year,week,weekIndex]);
}
