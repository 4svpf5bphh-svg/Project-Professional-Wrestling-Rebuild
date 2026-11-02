-- One optional audience result attached to the canonical, already settled show.
-- Historical receipts stay NULL. This is not a financial ledger or streaming claim.
ALTER TABLE ppw_show_economics
 ADD COLUMN IF NOT EXISTS audience_format text,
 ADD COLUMN IF NOT EXISTS tv_household_rating numeric(4,1),
 ADD COLUMN IF NOT EXISTS estimated_viewers bigint,
 ADD COLUMN IF NOT EXISTS ppv_buys bigint;
-- A partial/retried release must not fail after the columns have been added.
-- Scope the existence check to this table, not just a global constraint name.
DO $ppw_audience$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
   WHERE conrelid='public.ppw_show_economics'::regclass
    AND conname='ppw_audience_values_valid'
 ) THEN
  ALTER TABLE public.ppw_show_economics
   ADD CONSTRAINT ppw_audience_values_valid CHECK(
   (audience_format IS NULL AND tv_household_rating IS NULL
    AND estimated_viewers IS NULL AND ppv_buys IS NULL)
   OR (audience_format='TV' AND tv_household_rating BETWEEN 0 AND 10
    AND estimated_viewers>=0 AND ppv_buys IS NULL)
   OR (audience_format='PPV' AND ppv_buys>=0
    AND tv_household_rating IS NULL AND estimated_viewers IS NULL));
 END IF;
END $ppw_audience$;
