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
