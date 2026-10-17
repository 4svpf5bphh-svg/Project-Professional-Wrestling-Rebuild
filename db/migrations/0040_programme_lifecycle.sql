-- Original PPW's promotion-owned programme identity, sides and lifecycle.
-- Avoid loading all people or the full world to manage four participants.
ALTER TABLE ppw_programmes
 ADD COLUMN started_week_index integer CHECK(started_week_index>=0),
 ADD COLUMN ended_week_index integer CHECK(ended_week_index>=0),
 ADD COLUMN championship_id text,
 ADD COLUMN programme_key text CHECK(programme_key IS NULL OR length(programme_key)<=1200),
 ADD CONSTRAINT ppw_programme_lifecycle_weeks CHECK(
  ended_week_index IS NULL OR started_week_index IS NULL OR
  ended_week_index>=started_week_index);
CREATE UNIQUE INDEX ppw_active_programme_identity
 ON ppw_programmes(world_id,promotion_id,programme_key)
 WHERE status='ACTIVE' AND programme_key IS NOT NULL;
CREATE TABLE ppw_programme_side_refs(
 world_id text NOT NULL,promotion_id text NOT NULL,programme_id text NOT NULL,
 side text NOT NULL CHECK(side IN ('A','B')),
 position smallint NOT NULL CHECK(position BETWEEN 0 AND 1),
 ref_kind text NOT NULL CHECK(ref_kind IN ('PERSON','TEAM')),
 ref_id text NOT NULL CHECK(length(ref_id) BETWEEN 1 AND 200),
 PRIMARY KEY(world_id,promotion_id,programme_id,side,position),
 FOREIGN KEY(world_id,promotion_id,programme_id)
  REFERENCES ppw_programmes(world_id,promotion_id,programme_id)
);
CREATE INDEX ppw_programme_sides_by_programme
 ON ppw_programme_side_refs(world_id,promotion_id,programme_id);
