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
