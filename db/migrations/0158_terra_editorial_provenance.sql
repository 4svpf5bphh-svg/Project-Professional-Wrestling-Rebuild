-- Only private Lab metadata; existing samples and certified show data stay intact.
ALTER TABLE ppw_ai_lab_runs ADD COLUMN IF NOT EXISTS editorial_json jsonb;
ALTER TABLE ppw_ai_lab_runs ADD COLUMN IF NOT EXISTS editorial_assisted boolean NOT NULL DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='ppw_ai_lab_editorial_provenance_check' AND conrelid='ppw_ai_lab_runs'::regclass) THEN
  ALTER TABLE ppw_ai_lab_runs ADD CONSTRAINT ppw_ai_lab_editorial_provenance_check CHECK(
   (editorial_json IS NULL AND NOT editorial_assisted) OR
   (provider='OPENAI' AND status='READY' AND editorial_json IS NOT NULL AND
    jsonb_typeof(editorial_json)='object' AND length(editorial_json::text)<=16000));
 END IF;
END $$;
