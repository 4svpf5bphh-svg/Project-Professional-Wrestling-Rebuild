-- Immutable per-show facts for original rolling programme heat and repetition.
-- Booked links are planning state; only these completed facts count in history.
CREATE TABLE ppw_programme_resolved_activities (
 world_id text NOT NULL,promotion_id text NOT NULL,programme_id text NOT NULL,
 show_id text NOT NULL,slot_id text NOT NULL,
 week_index integer NOT NULL CHECK(week_index>=0),
 kind text NOT NULL CHECK(kind IN ('MATCH','SEGMENT')),
 signature text NOT NULL CHECK(length(signature) BETWEEN 1 AND 1200),
 crowd_response double precision NOT NULL CHECK(crowd_response BETWEEN 0 AND 100),
 impact double precision NOT NULL CHECK(impact BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,promotion_id,programme_id,show_id,slot_id),
 FOREIGN KEY(world_id,promotion_id,programme_id)
  REFERENCES ppw_programmes(world_id,promotion_id,programme_id),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id)
);
CREATE INDEX ppw_programme_recent_activities
 ON ppw_programme_resolved_activities(world_id,promotion_id,programme_id,week_index DESC);
