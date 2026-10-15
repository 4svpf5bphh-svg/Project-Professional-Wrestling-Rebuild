-- Exact original PPW skill dimensions. NULL means not yet migrated.
-- Never use guessed mid-range defaults for the canonical 600+ wrestler roster.
ALTER TABLE ppw_people
  ADD COLUMN in_ring_quality smallint CHECK(in_ring_quality BETWEEN 0 AND 100),
  ADD COLUMN match_craft smallint CHECK(match_craft BETWEEN 0 AND 100),
  ADD COLUMN presentation smallint CHECK(presentation BETWEEN 0 AND 100),
  ADD COLUMN stamina smallint CHECK(stamina BETWEEN 0 AND 100),
  ADD COLUMN safety smallint CHECK(safety BETWEEN 0 AND 100),
  ADD COLUMN fatigue smallint CHECK(fatigue BETWEEN 0 AND 100),
  ADD COLUMN wear smallint CHECK(wear BETWEEN 0 AND 100);
-- No index is necessary; the projection addresses the existing
-- (world_id,person_id) primary key using at most 100 person IDs per show.
