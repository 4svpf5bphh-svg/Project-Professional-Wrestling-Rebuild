-- Promotion-local stables as in original PPW; not interchangeable with portable tag teams.
-- Indexes enforce membership exclusivity per promotion without World JSON hydration.
CREATE TABLE ppw_stables(
 world_id text NOT NULL,promotion_id text NOT NULL,stable_id text NOT NULL,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 60),
 status text NOT NULL CHECK(status IN('ACTIVE','DISBANDED')),
 formed_week_index integer NOT NULL CHECK(formed_week_index>=0),
 disbanded_week_index integer,
 PRIMARY KEY(world_id,promotion_id,stable_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 CHECK((status='ACTIVE' AND disbanded_week_index IS NULL) OR
       (status='DISBANDED' AND disbanded_week_index>=formed_week_index))
);
CREATE UNIQUE INDEX ppw_active_stable_promotion_name
 ON ppw_stables(world_id,promotion_id,lower(btrim(name))) WHERE status='ACTIVE';
CREATE TABLE ppw_stable_memberships(
 world_id text NOT NULL,promotion_id text NOT NULL,stable_id text NOT NULL,
 membership_id text NOT NULL,person_id text NOT NULL,
 joined_week_index integer NOT NULL CHECK(joined_week_index>=0),
 left_week_index integer,active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(world_id,promotion_id,membership_id),
 FOREIGN KEY(world_id,promotion_id,stable_id)
  REFERENCES ppw_stables(world_id,promotion_id,stable_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 CHECK((active AND left_week_index IS NULL) OR
       (NOT active AND left_week_index>=joined_week_index))
);
CREATE UNIQUE INDEX ppw_one_active_stable_per_promotion_wrestler
 ON ppw_stable_memberships(world_id,promotion_id,person_id) WHERE active;
CREATE INDEX ppw_stable_current_members
 ON ppw_stable_memberships(world_id,promotion_id,stable_id) WHERE active;
CREATE INDEX ppw_stable_membership_history
 ON ppw_stable_memberships(world_id,promotion_id,stable_id,joined_week_index DESC);
