-- One bounded, per-owner, per-certified-show post-publication shortform bundle.
-- Never participates in World Lock, never authored by client text or AI,
-- and never triggers another provider request when a cached page is opened.
CREATE TABLE IF NOT EXISTS ppw_postshow_voice_batches(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 promotion_id text NOT NULL,
 show_id text NOT NULL,
 player_id text NOT NULL,
 receipt_digest text NOT NULL CHECK(length(receipt_digest)=64),
 state text NOT NULL DEFAULT 'PENDING'
  CHECK(state IN ('PENDING','READY','FAILED')),
 model text NOT NULL DEFAULT 'openai/gpt-oss-20b',
 copy_json jsonb,
 provider_calls smallint NOT NULL DEFAULT 0
  CHECK(provider_calls BETWEEN 0 AND 1),
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(world_id,promotion_id,show_id,player_id),
 CHECK((state='READY' AND copy_json IS NOT NULL AND completed_at IS NOT NULL)
   OR (state<>'READY' AND copy_json IS NULL))
);
CREATE INDEX IF NOT EXISTS ppw_postshow_voice_recent
 ON ppw_postshow_voice_batches(world_id,player_id,promotion_id,created_at DESC)
 WHERE state='READY';
