-- Phase 53D. One tiny forward-planning outline on the existing promotion row.
-- Booker's notes are intentions only: not match cards, results or booked fees.
-- PostgreSQL's metadata-only constant default leaves historic saved worlds intact.
ALTER TABLE ppw_promotions
 ADD COLUMN IF NOT EXISTS creative_outline jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ppw_creative_outline_bounds') THEN
  ALTER TABLE ppw_promotions ADD CONSTRAINT ppw_creative_outline_bounds
   CHECK (jsonb_typeof(creative_outline)='array'
    AND jsonb_array_length(creative_outline)<=7
    AND pg_column_size(creative_outline)<=4096);
 END IF;
END $$;
