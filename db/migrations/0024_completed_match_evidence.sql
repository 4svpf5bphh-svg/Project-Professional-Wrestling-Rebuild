-- Evidence travels with the completed result in the same World transaction.
-- These rows are not independent authority: only the server World resolver
-- may call the completed-show writer with its derived evidence.
CREATE TABLE ppw_completed_match_evidence (
 world_id text NOT NULL,
 show_id text NOT NULL,
 match_id text NOT NULL,
 evidence_json jsonb NOT NULL CHECK(jsonb_typeof(evidence_json)='object'),
 PRIMARY KEY(world_id,show_id,match_id),
 FOREIGN KEY(world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id)
  ON DELETE CASCADE
);
