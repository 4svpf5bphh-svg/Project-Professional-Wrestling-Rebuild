-- Durable authoritative show results. Writer must verify World RESOLVING,
-- the canonical submitted card, and server-computed receipt in one transaction.
-- The schema deliberately provides no client-facing insertion path.
CREATE TABLE ppw_completed_shows (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 promotion_id text NOT NULL,
 show_id text NOT NULL,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 resolution_id text NOT NULL CHECK(length(resolution_id)>0),
 crowd_response numeric(5,1) NOT NULL CHECK(crowd_response BETWEEN 0 AND 100),
 receipt_json jsonb NOT NULL CHECK(jsonb_typeof(receipt_json)='object'),
 receipt_digest char(64) NOT NULL CHECK(receipt_digest ~ '^[0-9a-f]{64}$'),
 completed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,show_id),
 UNIQUE(world_id,resolution_id,show_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_completed_shows_by_week
 ON ppw_completed_shows(world_id,year,week,promotion_id);
CREATE TABLE ppw_completed_show_matches (
 world_id text NOT NULL,
 show_id text NOT NULL,
 match_id text NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 crowd_response numeric(5,1) NOT NULL CHECK(crowd_response BETWEEN 0 AND 100),
 actual_finish text NOT NULL CHECK(length(actual_finish)>0),
 actual_winner_side text CHECK(actual_winner_side IN ('A','B')),
 PRIMARY KEY(world_id,show_id,match_id),
 UNIQUE(world_id,show_id,position),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id)
);
CREATE TABLE ppw_completed_show_segments (
 world_id text NOT NULL,
 show_id text NOT NULL,
 slot_id text NOT NULL,
 position integer NOT NULL CHECK(position>=0),
 kind text NOT NULL CHECK(length(kind)>0),
 authored_outcome text NOT NULL CHECK(authored_outcome IN
 ('HAPPENS','REFUSED','INTERRUPTED')),
 crowd_response numeric(5,1) NOT NULL CHECK(crowd_response BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,show_id,slot_id),
 UNIQUE(world_id,show_id,position),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id)
);
-- Cross-type position uniqueness is enforced by the future transactional
-- resolver, using the validated receipt before either child insert.
