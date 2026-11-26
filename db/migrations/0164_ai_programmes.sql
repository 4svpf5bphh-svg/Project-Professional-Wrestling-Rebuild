-- AI authorship travels with a canonical Programme across changes of ownership.
ALTER TABLE ppw_programmes ADD COLUMN IF NOT EXISTS ai_authored boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS ppw_one_active_ai_programme
 ON ppw_programmes(world_id,promotion_id) WHERE ai_authored AND status='ACTIVE';
CREATE INDEX IF NOT EXISTS ppw_ai_programme_recent_end
 ON ppw_programmes(world_id,promotion_id,ended_week_index DESC)
 WHERE ai_authored AND ended_week_index IS NOT NULL;
