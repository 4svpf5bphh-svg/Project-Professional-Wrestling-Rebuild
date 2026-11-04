-- Future commercial signings get one exclusive partner slot per World.
-- Grandfather pre-existing agreements to keep cash, terms and historical
-- rights intact; held partners are still unavailable until every term ends.
ALTER TABLE ppw_commercial_deals
 ADD COLUMN IF NOT EXISTS exclusive_rights boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS ppw_one_live_partner_per_world
 ON ppw_commercial_deals(world_id,offer_code)
 WHERE status='ACTIVE' AND exclusive_rights=true;
CREATE INDEX IF NOT EXISTS ppw_world_active_partner_inventory
 ON ppw_commercial_deals(world_id,offer_code,end_week_index)
 WHERE status='ACTIVE';

-- A broadcast deal owns one real weekly time window; existing terms keep
-- their historic schedule unspecified until they expire naturally.
ALTER TABLE ppw_commercial_deals
 ADD COLUMN IF NOT EXISTS airing_day smallint;
ALTER TABLE ppw_commercial_deals
 ADD COLUMN IF NOT EXISTS airing_hour smallint;
DO $ppw_airtime$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
  WHERE conname='ppw_commercial_airing_window') THEN
  ALTER TABLE ppw_commercial_deals ADD CONSTRAINT ppw_commercial_airing_window
   CHECK ((airing_day IS NULL OR airing_day BETWEEN 1 AND 7)
    AND (airing_hour IS NULL OR airing_hour BETWEEN 0 AND 23)
    AND (kind='BROADCAST' OR (airing_day IS NULL AND airing_hour IS NULL)));
 END IF;
END $ppw_airtime$;
