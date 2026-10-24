-- One-time identity snapshot: never rename anyone hired before this release.
-- Subsequent hires are new identities and do not enter the legacy set.
CREATE TABLE IF NOT EXISTS ppw_staff_legacy_identities (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 staff_id text NOT NULL,
 PRIMARY KEY(world_id,staff_id)
);
INSERT INTO ppw_staff_legacy_identities(world_id,staff_id)
SELECT DISTINCT world_id,staff_id FROM ppw_staff_employments
ON CONFLICT DO NOTHING;
