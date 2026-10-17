-- Thread archive is private and does not change World revision, booking,
-- wrestler morale, or conversation outcome. Newer messages revive the thread.
CREATE TABLE ppw_backstage_thread_archives(
 world_id text NOT NULL,promotion_id text NOT NULL,
 player_id text NOT NULL,person_id text NOT NULL,
 archived_through_week_index integer NOT NULL CHECK(archived_through_week_index>=-1),
 PRIMARY KEY(world_id,promotion_id,player_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,player_id) REFERENCES ppw_memberships(world_id,player_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
