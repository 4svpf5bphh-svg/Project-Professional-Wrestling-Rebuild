BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Pause application writers before running. The locks close the race between
-- checking the idle state and changing tables used by settlement.
LOCK TABLE ppw_worlds, ppw_world_update_runs, ppw_world_update_jobs,
 ppw_weekly_world_editorial, ppw_world_rumour_cases IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM ppw_worlds WHERE phase <> 'OPEN')
 OR EXISTS (SELECT 1 FROM ppw_world_update_runs WHERE state = 'ACTIVE')
 OR EXISTS (SELECT 1 FROM ppw_weekly_world_editorial WHERE state = 'PENDING')
 THEN RAISE EXCEPTION '0166 requires idle Worlds and no pending editorial'; END IF;
END $$;

ALTER TABLE ppw_weekly_world_editorial ADD COLUMN IF NOT EXISTS inspection_json jsonb;
ALTER TABLE ppw_weekly_world_editorial
 DROP CONSTRAINT IF EXISTS ppw_weekly_world_editorial_inspection_json_check,
 ADD CONSTRAINT ppw_weekly_world_editorial_inspection_json_check CHECK (
  inspection_json IS NULL OR
  (jsonb_typeof(inspection_json)='object' AND octet_length(inspection_json::text)<=12000)
 );

CREATE INDEX IF NOT EXISTS ppw_world_rumours_recent_open
 ON ppw_world_rumour_cases(world_id,origin_week_index DESC,case_key)
 WHERE chapter<2;

DO $$
BEGIN
 IF NOT EXISTS (
  SELECT FROM pg_attribute WHERE attrelid='ppw_weekly_world_editorial'::regclass
  AND attname='inspection_json' AND atttypid='jsonb'::regtype AND NOT attnotnull AND NOT attisdropped
 ) OR NOT EXISTS (
  SELECT FROM pg_index WHERE indexrelid='ppw_world_rumours_recent_open'::regclass
   AND indrelid='ppw_world_rumour_cases'::regclass AND indisvalid
   AND pg_get_indexdef(indexrelid) LIKE '%USING btree (world_id, origin_week_index DESC, case_key) WHERE (chapter < 2)'
 ) THEN RAISE EXCEPTION '0166 catalogue verification failed'; END IF;
END $$;
COMMIT;
