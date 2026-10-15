-- A durable, provisional resource arbitration receipt. This is NOT an
-- allocation, authorization to consume dates, or a weekly clearance.
-- One small row per World week with contested outcomes only.
CREATE TABLE ppw_week_arbitration_proposals (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  year integer NOT NULL CHECK (year>0),
  week integer NOT NULL CHECK (week BETWEEN 1 AND 52),
  source_revision bigint NOT NULL CHECK (source_revision>=0),
  state_fingerprint char(64) NOT NULL,
  claim_fingerprint char(64) NOT NULL,
  proposal jsonb NOT NULL,
  disputed_count integer NOT NULL CHECK(disputed_count>0),
  command_request_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(world_id,year,week),
  UNIQUE(world_id,command_request_id)
);
