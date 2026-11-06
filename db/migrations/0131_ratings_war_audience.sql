-- Ratings War is published only once ALL certified TV shows for a World
-- week exist. Keep the original audience as immutable settlement evidence:
-- retries always project from these values, never from already shifted ratings.
-- Old shows remain NULL (their prior audience is not retroactively invented).
ALTER TABLE ppw_show_economics
 ADD COLUMN IF NOT EXISTS ratings_war_base_rating numeric(4,1),
 ADD COLUMN IF NOT EXISTS ratings_war_base_viewers bigint,
 ADD COLUMN IF NOT EXISTS ratings_war_opponents smallint;

DO $ppw_ratings_war$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
   WHERE conrelid='public.ppw_show_economics'::regclass
    AND conname='ppw_ratings_war_audience_valid') THEN
  ALTER TABLE public.ppw_show_economics ADD CONSTRAINT ppw_ratings_war_audience_valid
   CHECK (
    (ratings_war_base_rating IS NULL AND
     ratings_war_base_viewers IS NULL AND ratings_war_opponents IS NULL)
    OR (audience_format='TV' AND
     ratings_war_base_rating BETWEEN 0 AND 10
     AND ratings_war_base_viewers>=0 AND
     ratings_war_opponents BETWEEN 0 AND 127)
   );
 END IF;
END $ppw_ratings_war$;
