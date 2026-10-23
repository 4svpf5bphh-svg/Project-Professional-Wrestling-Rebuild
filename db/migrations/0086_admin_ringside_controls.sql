-- Owner-only Ringside preferences. Settings never mutate any completed results.
CREATE TABLE IF NOT EXISTS ppw_admin_ringside_settings (
 world_id text PRIMARY KEY REFERENCES ppw_worlds(world_id),
 model text NOT NULL DEFAULT 'openai/gpt-oss-120b'
  CHECK (model IN ('openai/gpt-oss-120b','openai/gpt-oss-20b')),
 voice text NOT NULL DEFAULT 'MARTY'
  CHECK (voice IN ('MARTY','SPORTS','SATIRE')),
 detail text NOT NULL DEFAULT 'BALANCED'
  CHECK (detail IN ('SHORT','BALANCED','LONG')),
 creativity numeric(3,2) NOT NULL DEFAULT 0.92 CHECK (creativity BETWEEN 0 AND 1.5),
 reasoning text NOT NULL DEFAULT 'low'
  CHECK (reasoning IN ('low','medium','high')),
 additional_guidance text NOT NULL DEFAULT ''
  CHECK (length(additional_guidance)<=900),
 version integer NOT NULL DEFAULT 1 CHECK (version>=1),
 updated_by text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ppw_admin_action_audit (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 event_id text NOT NULL,
 player_id text NOT NULL,
 action text NOT NULL CHECK (length(action) BETWEEN 1 AND 70),
 context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,event_id)
);
CREATE INDEX IF NOT EXISTS ppw_admin_action_audit_recent
 ON ppw_admin_action_audit(world_id,created_at DESC);
