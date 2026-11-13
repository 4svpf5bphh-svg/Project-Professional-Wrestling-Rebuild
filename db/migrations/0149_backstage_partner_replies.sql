-- Private second-wrestler voice following a manager's real PARTNERSHIP mediation.
-- Read-only source is the original wrestler request; only a deliberate answer
-- is stored. Never changes chemistry, awards morale or books a match.
CREATE TABLE ppw_backstage_partner_replies(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 mail_id text NOT NULL CHECK(mail_id ~ '^backstage-world:[a-f0-9]{32}$'),
 source_request_id text NOT NULL,
 initiating_person_id text NOT NULL,
 partner_person_id text NOT NULL,
 player_id text NOT NULL,
 decision text NOT NULL CHECK(decision IN ('INVITE','LEAVE')),
 outcome text NOT NULL CHECK(outcome IN ('READY','CAUTIOUS','DECLINED')),
 professional_trust_at_reply double precision NOT NULL
  CHECK(professional_trust_at_reply BETWEEN -100 AND 100),
 responded_week_index integer NOT NULL CHECK(responded_week_index>=0),
 PRIMARY KEY(world_id,promotion_id,mail_id),
 UNIQUE(world_id,promotion_id,source_request_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,source_request_id) REFERENCES ppw_backstage_requests(world_id,request_id),
 FOREIGN KEY(world_id,initiating_person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,partner_person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_partner_replies_person
 ON ppw_backstage_partner_replies(world_id,promotion_id,partner_person_id,responded_week_index DESC);
