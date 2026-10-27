-- First-class, promotion-owned four-person singles tournament.
-- A fixture is reserved by an authored draft and settles only from certified
-- results inside the existing single World Lock. No new scheduler or polling.
CREATE TABLE ppw_tournaments (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 tournament_id text NOT NULL,
 name text NOT NULL CHECK(length(name) BETWEEN 3 AND 64),
 division text NOT NULL CHECK(division IN ('MEN','WOMEN')),
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','COMPLETE')),
 championship_id text,
 created_week_index integer NOT NULL CHECK(created_week_index>=0),
 winner_person_id text,
 PRIMARY KEY(world_id,promotion_id,tournament_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id,championship_id)
  REFERENCES ppw_championships(world_id,promotion_id,championship_id),
 FOREIGN KEY(world_id,winner_person_id) REFERENCES ppw_people(world_id,person_id),
 CHECK((status='ACTIVE' AND winner_person_id IS NULL) OR
       (status='COMPLETE' AND winner_person_id IS NOT NULL))
);
CREATE UNIQUE INDEX ppw_one_active_tournament_per_promotion
 ON ppw_tournaments(world_id,promotion_id) WHERE status='ACTIVE';
CREATE TABLE ppw_tournament_bouts (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 tournament_id text NOT NULL,
 bout_no smallint NOT NULL CHECK(bout_no BETWEEN 1 AND 3),
 person_a text,
 person_b text,
 show_id text,
 slot_id text,
 winner_person_id text,
 resolved_week_index integer,
 PRIMARY KEY(world_id,promotion_id,tournament_id,bout_no),
 FOREIGN KEY(world_id,promotion_id,tournament_id)
  REFERENCES ppw_tournaments(world_id,promotion_id,tournament_id),
 FOREIGN KEY(world_id,person_a) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,person_b) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,winner_person_id) REFERENCES ppw_people(world_id,person_id),
 CHECK(person_a IS NULL OR person_b IS NULL OR person_a<>person_b),
 CHECK((show_id IS NULL AND slot_id IS NULL) OR
       (show_id IS NOT NULL AND slot_id IS NOT NULL)),
 CHECK((winner_person_id IS NULL AND resolved_week_index IS NULL) OR
       (winner_person_id IS NOT NULL AND resolved_week_index IS NOT NULL
        AND winner_person_id IN (person_a,person_b)))
);
CREATE UNIQUE INDEX ppw_tournament_one_bout_per_card_slot
 ON ppw_tournament_bouts(world_id,show_id,slot_id) WHERE show_id IS NOT NULL;
CREATE INDEX ppw_tournament_booked_bouts
 ON ppw_tournament_bouts(world_id,promotion_id,show_id)
 WHERE show_id IS NOT NULL;
