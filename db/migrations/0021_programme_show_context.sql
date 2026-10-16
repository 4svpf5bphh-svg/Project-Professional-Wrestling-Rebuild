-- Promotion-owned storyline records. Unknown historical heat remains NULL.
ALTER TABLE ppw_worlds ADD COLUMN programme_history_loaded boolean NOT NULL DEFAULT false;
CREATE TABLE ppw_programmes (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 programme_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','INACTIVE','COMPLETED')),
 heat double precision CHECK(heat BETWEEN 0 AND 100),
 repetition double precision NOT NULL CHECK(repetition BETWEEN 0 AND 100000),
 PRIMARY KEY(world_id,promotion_id,programme_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE TABLE ppw_programme_match_activities (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 programme_id text NOT NULL,
 draft_id text NOT NULL,
 slot_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('MATCH','SEGMENT')),
 PRIMARY KEY(world_id,promotion_id,programme_id,draft_id,slot_id),
 FOREIGN KEY(world_id,promotion_id,programme_id)
  REFERENCES ppw_programmes(world_id,promotion_id,programme_id),
 FOREIGN KEY(world_id,draft_id,slot_id)
  REFERENCES ppw_card_slots(world_id,draft_id,slot_id)
);
CREATE INDEX ppw_programme_activity_show
 ON ppw_programme_match_activities(world_id,draft_id,kind);
