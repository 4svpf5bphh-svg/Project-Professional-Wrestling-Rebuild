-- The original World starts with one singles and one tag championship per
-- non-closed promotion. Restore that invariant for already imported Worlds.
-- This does not choose inaugural champions or alter booked results.
INSERT INTO ppw_championships(
 world_id,promotion_id,championship_id,name,division,status,prestige)
SELECT p.world_id,p.promotion_id,'founding:'||lower(d.division),
 p.name||CASE WHEN d.division='SINGLES'
 THEN ' World Championship' ELSE ' Tag Team Championship' END,
 d.division,
 CASE WHEN p.lifecycle='DORMANT' THEN 'INACTIVE' ELSE 'ACTIVE' END,
 CASE p.tier WHEN 'GLOBAL' THEN 72 WHEN 'NATIONAL' THEN 58
  WHEN 'RISING' THEN 45 WHEN 'INDEPENDENT' THEN 34 ELSE 25 END
FROM ppw_promotions p CROSS JOIN (VALUES('SINGLES'),('TAG')) d(division)
WHERE p.lifecycle<>'CLOSED' AND NOT EXISTS(
 SELECT 1 FROM ppw_championships c
 WHERE c.world_id=p.world_id AND c.promotion_id=p.promotion_id
 AND c.division=d.division
)
ON CONFLICT DO NOTHING;

-- One index serves keyset lineage paging for any championship, without
-- reading its entire reign history into a player session.
CREATE INDEX ppw_championship_reigns_lineage
 ON ppw_championship_reigns(
  world_id,promotion_id,championship_id,start_week_index DESC,reign_id DESC);
