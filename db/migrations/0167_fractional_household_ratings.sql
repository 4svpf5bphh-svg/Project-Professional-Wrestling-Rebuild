-- Remove the scale modifier so fractional local ratings survive settlement.
-- The existing rating constraints still bound the range. Widening to unmodified
-- numeric keeps the same storage representation and requires no backfill.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $migration$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_attribute
  WHERE attrelid='public.ppw_show_economics'::regclass
   AND attname='tv_household_rating' AND atttypmod<>-1
 ) THEN
  ALTER TABLE public.ppw_show_economics
   ALTER COLUMN tv_household_rating TYPE numeric,
   ALTER COLUMN ratings_war_base_rating TYPE numeric;
 END IF;
END $migration$;
COMMIT;
