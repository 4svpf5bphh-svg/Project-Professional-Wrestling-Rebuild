-- The original PPW match scoring needs audience pull and show importance,
-- not only skill. NULL = canonical source not yet migrated (fail closed).
ALTER TABLE ppw_people
 ADD COLUMN momentum smallint CHECK(momentum BETWEEN 0 AND 100),
 ADD COLUMN popularity smallint CHECK(popularity BETWEEN 0 AND 100),
 ADD COLUMN recognition smallint CHECK(recognition BETWEEN 0 AND 100);
ALTER TABLE ppw_booking_drafts
 ADD COLUMN event_importance smallint CHECK(event_importance BETWEEN 0 AND 100);

-- Singles chemistry is World-owned shared history, not per-promotion.
-- Unknown pair: compute original seeded compatibility without writing.
CREATE TABLE ppw_working_chemistry (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  person_a_id text NOT NULL,
  person_b_id text NOT NULL,
  context text NOT NULL CHECK(context IN ('SINGLES','TAG')),
  compatibility numeric(5,1) NOT NULL CHECK(compatibility BETWEEN -12 AND 13),
  familiarity numeric(5,1) NOT NULL DEFAULT 0 CHECK(familiarity BETWEEN 0 AND 100),
  matches_together integer NOT NULL DEFAULT 0 CHECK(matches_together>=0),
  PRIMARY KEY(world_id,context,person_a_id,person_b_id),
  CHECK(person_a_id<person_b_id),
  FOREIGN KEY(world_id,person_a_id) REFERENCES ppw_people(world_id,person_id),
  FOREIGN KEY(world_id,person_b_id) REFERENCES ppw_people(world_id,person_id)
);
