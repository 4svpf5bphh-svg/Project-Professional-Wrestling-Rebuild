ALTER TABLE ppw_worlds DROP CONSTRAINT IF EXISTS ppw_worlds_phase_check;
ALTER TABLE ppw_worlds ADD CONSTRAINT ppw_worlds_phase_check CHECK (phase IN ('OPEN','LOCKED','RESOLVING','UPDATING'));
CREATE TABLE IF NOT EXISTS ppw_world_update_runs (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 year integer NOT NULL, week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 state text NOT NULL CHECK(state IN ('ACTIVE','COMPLETE')),
 public_state text NOT NULL CHECK(public_state IN ('WAITING','PROCESSING','READY','FALLBACK')),
 public_claim_token text, public_claim_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 PRIMARY KEY(world_id,year,week)
);
CREATE UNIQUE INDEX IF NOT EXISTS ppw_one_active_world_update ON ppw_world_update_runs(world_id) WHERE state='ACTIVE';
CREATE TABLE IF NOT EXISTS ppw_world_update_jobs (
 world_id text NOT NULL, year integer NOT NULL, week integer NOT NULL,
 show_id text NOT NULL, promotion_id text NOT NULL, player_id text NOT NULL,
 show_day integer NOT NULL,
 state text NOT NULL CHECK(state IN ('WAITING','PROCESSING','READY','FALLBACK')),
 claim_token text, claim_until timestamptz,
 PRIMARY KEY(world_id,year,week,show_id),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_world_update_runs(world_id,year,week) ON DELETE CASCADE
);
