-- Authoritative completed finish ledger. Only the World resolver writes these
-- records, once per resolved match. Never use pending/fictional results.
ALTER TABLE ppw_worlds ADD COLUMN dirty_finish_history_loaded boolean NOT NULL DEFAULT false;
CREATE TABLE ppw_completed_dirty_finishes (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 match_id text NOT NULL,
 week_index integer NOT NULL CHECK(week_index>=0),
 actual_finish text NOT NULL CHECK(actual_finish IN ('DISQUALIFICATION','FOREIGN_OBJECT')),
 cheater_person_id text NOT NULL,
 participant_ids text[] NOT NULL CHECK(cardinality(participant_ids) BETWEEN 2 AND 100),
 PRIMARY KEY(world_id,promotion_id,match_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,cheater_person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_dirty_finish_recent
 ON ppw_completed_dirty_finishes(world_id,promotion_id,week_index,cheater_person_id);
