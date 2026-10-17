-- Immutable results metadata from the deterministic World resolution.
-- A single set-based writer stores complete injury facts and critical ratings.
CREATE TABLE ppw_completed_match_report_facts (
 world_id text NOT NULL,show_id text NOT NULL,match_id text NOT NULL,
 rating_stars numeric(3,2) NOT NULL CHECK(rating_stars BETWEEN 0 AND 5),
 actual_minutes integer NOT NULL CHECK(actual_minutes BETWEEN 3 AND 120),
 injuries_json jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK(jsonb_typeof(injuries_json)='array'),
 PRIMARY KEY(world_id,show_id,match_id),
 FOREIGN KEY(world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id)
);
