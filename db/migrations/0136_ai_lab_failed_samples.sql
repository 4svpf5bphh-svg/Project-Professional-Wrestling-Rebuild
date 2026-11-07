-- Keep failed owner-triggered editorial comparisons visible without persisting
-- rejected/generated text, private context, API credentials, or raw error data.
-- Existing successful samples remain valid. Idempotent on repeat apply.
ALTER TABLE ppw_ai_lab_runs
 ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'READY'
   CHECK(status IN ('READY','FAILED'));
ALTER TABLE ppw_ai_lab_runs
 ADD COLUMN IF NOT EXISTS error_code text
   CHECK(error_code IN ('FACT_VALIDATION','PROVIDER_LIMIT',
    'PROVIDER_AUTH','PROVIDER_ERROR','INVALID_OUTPUT','OUTPUT_INCOMPLETE','UNKNOWN'));
ALTER TABLE ppw_ai_lab_runs ALTER COLUMN review_json DROP NOT NULL;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ppw_ai_lab_outcome_consistency') THEN
  ALTER TABLE ppw_ai_lab_runs ADD CONSTRAINT ppw_ai_lab_outcome_consistency CHECK(
   (status='READY' AND review_json IS NOT NULL AND error_code IS NULL) OR
   (status='FAILED' AND review_json IS NULL AND error_code IS NOT NULL
    AND rating IS NULL));
 END IF;
END$$;
