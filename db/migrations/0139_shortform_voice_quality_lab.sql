-- Fictional operator-only shortform quality samples. Does not refer to or
-- create any completed World event and cannot be read by another manager.
CREATE TABLE IF NOT EXISTS ppw_shortform_ai_lab_runs (
 run_id uuid PRIMARY KEY,
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 player_id text NOT NULL,
 scenario_id text NOT NULL
  CHECK (scenario_id IN ('i-quit','steel-cage','tag-standard')),
 model text NOT NULL DEFAULT 'openai/gpt-oss-20b',
 status text NOT NULL CHECK (status IN ('READY','FAILED')),
 error_code text CHECK(error_code IN ('NO_ACCEPTED_COPY','PROVIDER_ERROR','UNKNOWN')),
 duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 180000),
 provider_calls smallint NOT NULL CHECK(provider_calls BETWEEN 0 AND 1),
 input_tokens integer CHECK(input_tokens>=0),
 output_tokens integer CHECK(output_tokens>=0),
 copy_json jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((status='READY' AND copy_json IS NOT NULL AND error_code IS NULL) OR
  (status='FAILED' AND copy_json IS NULL AND error_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ppw_shortform_ai_lab_recent
 ON ppw_shortform_ai_lab_runs(world_id,player_id,created_at DESC);
