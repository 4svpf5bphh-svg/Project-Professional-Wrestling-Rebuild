-- One owner-only response to a real published-show free-agent approach.
-- A friendly reply is NOT a contract offer and cannot bypass wrestler evaluation.
CREATE TABLE ppw_backstage_free_agent_replies (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 mail_id text NOT NULL CHECK(mail_id ~ '^backstage-world:[a-f0-9]{32}$'),
 person_id text NOT NULL,
 player_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('INVITE','PASS')),
 responded_week_index integer NOT NULL CHECK(responded_week_index>=0),
 PRIMARY KEY(world_id,promotion_id,mail_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_backstage_free_agent_by_person
 ON ppw_backstage_free_agent_replies(world_id,promotion_id,person_id,responded_week_index)
 WHERE decision='INVITE';
