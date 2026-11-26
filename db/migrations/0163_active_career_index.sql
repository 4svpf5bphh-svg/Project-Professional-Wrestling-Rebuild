-- Bound weekly career reads by working identities. Retired wrestlers remain
-- in ppw_people and keep their existing references and archive lookups.
CREATE INDEX IF NOT EXISTS ppw_people_working_careers
 ON ppw_people(world_id,person_id) WHERE status<>'RETIRED';
