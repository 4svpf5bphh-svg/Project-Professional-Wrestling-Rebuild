-- One optional audience result attached to the canonical, already settled show.
-- Historical receipts stay NULL. This is not a financial ledger or streaming claim.
ALTER TABLE ppw_show_economics
 ADD COLUMN IF NOT EXISTS audience_format text,
 ADD COLUMN IF NOT EXISTS tv_household_rating numeric(4,1),
 ADD COLUMN IF NOT EXISTS estimated_viewers bigint,
 ADD COLUMN IF NOT EXISTS ppv_buys bigint;
ALTER TABLE ppw_show_economics
 ADD CONSTRAINT ppw_audience_values_valid CHECK(
 (audience_format IS NULL AND tv_household_rating IS NULL
  AND estimated_viewers IS NULL AND ppv_buys IS NULL)
 OR (audience_format='TV' AND tv_household_rating BETWEEN 0 AND 10
  AND estimated_viewers>=0 AND ppv_buys IS NULL)
 OR (audience_format='PPV' AND ppv_buys>=0
  AND tv_household_rating IS NULL AND estimated_viewers IS NULL));
