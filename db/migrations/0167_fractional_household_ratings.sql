-- Pause World advancement and booking writers before applying this migration.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Close the race between checking for idle Worlds and changing settlement data.
LOCK TABLE public.ppw_worlds, public.ppw_world_update_runs,
 public.ppw_weekly_world_editorial IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
BEGIN
 IF EXISTS (SELECT FROM public.ppw_worlds WHERE phase <> 'OPEN')
 OR EXISTS (SELECT FROM public.ppw_world_update_runs WHERE state = 'ACTIVE')
 OR EXISTS (SELECT FROM public.ppw_weekly_world_editorial WHERE state = 'PENDING')
 THEN RAISE EXCEPTION '0167 requires idle Worlds and no pending editorial'; END IF;
END $migration$;

LOCK TABLE public.ppw_show_economics IN ACCESS EXCLUSIVE MODE;
DO $migration$
DECLARE
 ratings oid := 'public.ppw_show_economics'::regclass;
BEGIN
 -- Only the shipped numeric(4,1) shape or its already-widened equivalent
 -- can take this metadata-only path.
 IF (SELECT count(*) FROM pg_attribute
     WHERE attrelid=ratings AND NOT attisdropped AND NOT attnotnull
     AND attname IN ('tv_household_rating','ratings_war_base_rating')
     AND format_type(atttypid,atttypmod) IN ('numeric(4,1)','numeric')) <> 2
 THEN RAISE EXCEPTION '0167 found unexpected household rating columns'; END IF;

 IF EXISTS (SELECT FROM pg_attribute WHERE attrelid=ratings AND NOT attisdropped
    AND attname IN ('tv_household_rating','ratings_war_base_rating') AND atttypmod <> -1)
 THEN
  ALTER TABLE public.ppw_show_economics
   ALTER COLUMN tv_household_rating TYPE numeric,
   ALTER COLUMN ratings_war_base_rating TYPE numeric;
 END IF;

 IF (SELECT count(*) FROM pg_attribute
     WHERE attrelid=ratings AND NOT attisdropped AND NOT attnotnull
     AND attname IN ('tv_household_rating','ratings_war_base_rating')
     AND atttypid='numeric'::regtype AND atttypmod=-1) <> 2
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=ratings
     AND contype='c' AND convalidated
     AND conname IN ('ppw_audience_values_valid','ppw_ratings_war_audience_valid')) <> 2
 THEN RAISE EXCEPTION '0167 catalogue verification failed'; END IF;
END $migration$;
COMMIT;
