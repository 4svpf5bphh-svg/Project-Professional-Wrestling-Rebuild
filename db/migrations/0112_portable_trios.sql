-- Portable, named three-person units. A trio is not a tag-title holder or
-- a promotion-local faction; existing 2v2 teams/championships are unchanged.
CREATE TABLE ppw_trios (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 trio_id text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 70),
 status text NOT NULL CHECK(status IN ('ACTIVE','DISBANDED')),
 naming_promotion_id text,
 formed_week_index integer NOT NULL CHECK(formed_week_index>=0),
 PRIMARY KEY(world_id,trio_id),
 FOREIGN KEY(world_id,naming_promotion_id)
  REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE TABLE ppw_trio_members (
 world_id text NOT NULL,trio_id text NOT NULL,person_id text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(world_id,trio_id,person_id),
 FOREIGN KEY(world_id,trio_id) REFERENCES ppw_trios(world_id,trio_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_trios_active_members
 ON ppw_trio_members(world_id,person_id,trio_id) WHERE active;
CREATE INDEX ppw_trios_owner
 ON ppw_trios(world_id,naming_promotion_id,trio_id)
 WHERE status='ACTIVE';
