-- Invisible fictional gossip state, owned by the certified-week publisher.
CREATE TABLE ppw_world_rumour_cases(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 case_key text NOT NULL,origin_week_index integer NOT NULL CHECK(origin_week_index>=0),
 last_followup_week_index integer,chapter smallint NOT NULL DEFAULT 0 CHECK(chapter BETWEEN 0 AND 2),
 veracity text NOT NULL CHECK(veracity IN ('SUBSTANTIATED','DISTORTED','FABRICATED')),
 promotion_id text NOT NULL,promotion_name text NOT NULL,show_id text NOT NULL,headline text NOT NULL,
 PRIMARY KEY(world_id,case_key)
);
CREATE INDEX ppw_world_rumours_followup ON ppw_world_rumour_cases
 (world_id,chapter,last_followup_week_index,origin_week_index DESC);
