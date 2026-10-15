-- World-local resource identities; a venue string in a draft alone is NOT
-- proof that a bookable real venue exists.
CREATE TABLE ppw_venues (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  venue_id text NOT NULL CHECK (length(venue_id) BETWEEN 1 AND 200),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INACTIVE')),
  PRIMARY KEY(world_id,venue_id)
);
-- A nullable override preserves existing world imports. Until a historical
-- workload model is ported, NULL is treated as seven available show-days.
ALTER TABLE ppw_people
  ADD COLUMN weekly_service_capacity smallint NULL
  CHECK (weekly_service_capacity BETWEEN 1 AND 7);
