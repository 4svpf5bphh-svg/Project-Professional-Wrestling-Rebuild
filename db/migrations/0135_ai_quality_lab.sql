-- Owner-only AI quality lab. A row exists only when the designated
-- operator deliberately tests a completed, controlled show. Never called
-- during World Lock, page loads or public Results.
CREATE TABLE IF NOT EXISTS ppw_ai_lab_runs(
 run_id uuid PRIMARY KEY,
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 player_id text NOT NULL,
 show_id text NOT NULL,
 show_name text NOT NULL,
 provider text NOT NULL CHECK(provider IN ('GROQ','OPENAI')),
 model text NOT NULL,
 duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 180000),
 provider_calls smallint NOT NULL CHECK(provider_calls BETWEEN 0 AND 2),
 input_tokens integer CHECK(input_tokens>=0),
 output_tokens integer CHECK(output_tokens>=0),
 review_json jsonb NOT NULL,
 rating smallint CHECK(rating BETWEEN 1 AND 5),
 flags text[] NOT NULL DEFAULT '{}',
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppw_ai_lab_recent
 ON ppw_ai_lab_runs(world_id,player_id,created_at DESC);
