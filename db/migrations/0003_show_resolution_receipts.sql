-- One durable resolution per show. The primary key prevents charging the
-- same show under different request IDs, even across retries or workers.
CREATE TABLE IF NOT EXISTS ppw_show_resolutions (
  world_id text NOT NULL,
  show_id text NOT NULL,
  promotion_id text NOT NULL,
  resolved_week_index integer NOT NULL CHECK (resolved_week_index >= 0),
  command_request_id text NOT NULL,
  performers_count integer NOT NULL CHECK (performers_count >= 0),
  dates_charged integer NOT NULL CHECK (dates_charged >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, show_id),
  UNIQUE (world_id, command_request_id),
  FOREIGN KEY (world_id) REFERENCES ppw_worlds(world_id)
);
CREATE INDEX IF NOT EXISTS ppw_show_resolutions_promotion_week
ON ppw_show_resolutions(world_id,promotion_id,resolved_week_index);
