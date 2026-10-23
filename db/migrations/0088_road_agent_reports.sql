-- A short immutable professional assessment is persisted alongside each
-- certified human promotion show. No LLM calls and no per-week polling.
CREATE TABLE ppw_staff_show_reports(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 show_id text NOT NULL,
 promotion_id text NOT NULL,
 staff_id text,
 reporter_name text NOT NULL,
 analysis_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,show_id),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id)
  ON DELETE CASCADE,
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
  ON DELETE CASCADE
);
