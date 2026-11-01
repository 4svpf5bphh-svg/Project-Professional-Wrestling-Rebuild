-- Capture real wrestler metrics once, at the instant a feud begins.
-- Historical feuds cannot be backfilled without inventing a starting point.
CREATE TABLE IF NOT EXISTS ppw_programme_talent_baselines(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 programme_id text NOT NULL,
 person_id text NOT NULL,
 start_popularity double precision,
 start_momentum double precision,
 PRIMARY KEY(world_id,promotion_id,programme_id,person_id)
);
