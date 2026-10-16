-- Match resolution persists evidence alongside the authored result.
-- Without this durable child table a completed show cannot be committed.
-- The evidence belongs to the same exact World/show/match result.
CREATE TABLE ppw_completed_match_evidence (
 world_id text NOT NULL,
 show_id text NOT NULL,
 match_id text NOT NULL,
 evidence_json jsonb NOT NULL CHECK (jsonb_typeof(evidence_json)='object'),
 PRIMARY KEY (world_id,show_id,match_id),
 FOREIGN KEY (world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id)
);
