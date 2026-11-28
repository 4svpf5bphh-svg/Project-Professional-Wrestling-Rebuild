/** A premium show may stand alone only during a genuine off-week on a
 * promotion's own recurring regular calendar. This is not permission to
 * ignore a regular show that is actually due, or to skip another manager.
 * Fragment is embedded in existing weekly reads (no extra Neon roundtrip).
 * Every caller uses $2=year, $3=week and a trusted SQL promotion alias.
 */
export function premiumOnlyWeekSql(promotionAlias:"p"){
 const idx="(($2::integer-1)*52+$3::integer-1)";
 const series=`s.world_id=${promotionAlias}.world_id AND
  s.promotion_id=${promotionAlias}.promotion_id AND s.active=true
  AND s.event_type='REGULAR'`;
 return `EXISTS(SELECT 1 FROM ppw_show_series s WHERE ${series})
  AND NOT EXISTS(SELECT 1 FROM ppw_show_series s WHERE ${series}
   AND ${idx}>=s.anchor_week
   AND mod(${idx}-s.anchor_week,s.cadence_weeks)=0)`;
}

/** Only autonomous promotions can use the automatic schedule exemption. An
 * explicit regular calendar governs signed TV. Without one the signed deal
 * is weekly, while a non-TV promoter uses its current operating cadence.
 */
const autonomous = `p.management_mode='AI' AND NOT EXISTS (
 SELECT FROM ppw_promotion_controls owner
 WHERE owner.world_id=p.world_id AND owner.promotion_id=p.promotion_id AND owner.active)`;

export function aiRegularOffWeekSql() {
 const index="(($2::integer-1)*52+$3::integer-1)";
 return `(${autonomous} AND (
  ${premiumOnlyWeekSql("p")}
  OR (
   NOT EXISTS (SELECT FROM ppw_show_series s WHERE s.world_id=p.world_id
    AND s.promotion_id=p.promotion_id AND s.active AND s.event_type='REGULAR')
   AND NOT EXISTS (SELECT FROM ppw_commercial_deals deal WHERE deal.world_id=p.world_id
    AND deal.promotion_id=p.promotion_id AND deal.kind='BROADCAST' AND deal.status='ACTIVE'
    AND ${index} BETWEEN deal.start_week_index AND deal.end_week_index)
   AND mod(${index},nullif(p.event_cadence_weeks,0))<>0
  )
 ))`;
}

/** An AI failure is durable evidence of a missed event, not a scheduled
 * dark week. The broadcaster audit can still register a missed delivery.
 */
export function noRegularShowRequiredSql() {
 return `(${aiRegularOffWeekSql()} OR (${autonomous} AND EXISTS (
  SELECT FROM ppw_week_staff_fallback_runs run
  JOIN ppw_command_receipts receipt ON receipt.world_id=run.world_id
   AND receipt.request_id=run.command_request_id
   AND receipt.command_type='GENERATE_WEEK_STAFF_FALLBACK_CARDS'
  WHERE run.world_id=p.world_id AND run.year=$2 AND run.week=$3
   AND (receipt.result->'unavailableAi') ? p.promotion_id
 )))`;
}
