-- Explicit canonical alignment, no guessed FACE/HEEL during historical import.
ALTER TABLE ppw_people ADD COLUMN default_alignment text
 CHECK(default_alignment IS NULL OR default_alignment IN ('FACE','HEEL','TWEENER'));
-- A new World starts without an imported historical record. Recording zero
-- changes is NOT equivalent to proving there have been no historical changes.
ALTER TABLE ppw_worlds ADD COLUMN alignment_history_loaded boolean NOT NULL DEFAULT false;

CREATE TABLE ppw_promotion_wrestler_alignments (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 person_id text NOT NULL,
 alignment text NOT NULL CHECK(alignment IN ('FACE','HEEL','TWEENER')),
 PRIMARY KEY(world_id,promotion_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
-- Small append-only fact table used for the archived 8-week confusion rule.
-- Initial presentation, signing and returns must not count as offscreen turns.
CREATE TABLE ppw_promotion_alignment_changes (
 world_id text NOT NULL,
 change_id bigint GENERATED ALWAYS AS IDENTITY,
 promotion_id text NOT NULL,
 person_id text NOT NULL,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 method text NOT NULL CHECK(method IN
  ('OFFSCREEN_SWITCH','TURN','INITIAL_PRESENTATION','JUST_SIGNED','RETURNING')),
 changed boolean NOT NULL DEFAULT true,
 PRIMARY KEY(world_id,change_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_alignment_changes_recent
 ON ppw_promotion_alignment_changes(world_id,promotion_id,year,week,person_id);
