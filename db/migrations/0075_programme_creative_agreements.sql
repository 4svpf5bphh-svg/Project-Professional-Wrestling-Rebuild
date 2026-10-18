-- Wrestler-approved limited-term rivalry terms. Cannot be reused for another
-- roster, employer or contract, and never override the booked outcome.
CREATE TABLE ppw_programme_creative_agreements(
 world_id text NOT NULL,promotion_id text NOT NULL,programme_id text NOT NULL,
 person_id text NOT NULL,contract_id text NOT NULL,
 decided_week_index integer NOT NULL CHECK(decided_week_index>=0),
 expires_week_index integer NOT NULL CHECK(expires_week_index>decided_week_index),
 match_type text NOT NULL CHECK(match_type IN ('SINGLES','TAG')),
 permitted_outcome text NOT NULL CHECK(permitted_outcome IN
  ('WIN_ONLY','WIN_OR_PROTECTED_LOSS')),
 own_people text[] NOT NULL,opponent_people text[] NOT NULL,
 approved boolean NOT NULL,score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,promotion_id,programme_id,person_id,contract_id),
 FOREIGN KEY(world_id,promotion_id,programme_id)
  REFERENCES ppw_programmes(world_id,promotion_id,programme_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,contract_id) REFERENCES ppw_contracts(world_id,contract_id),
 CHECK(cardinality(own_people) BETWEEN 1 AND 20),
 CHECK(cardinality(opponent_people) BETWEEN 1 AND 20)
);
CREATE INDEX ppw_programme_creative_current
 ON ppw_programme_creative_agreements(world_id,promotion_id,programme_id)
 WHERE approved;
