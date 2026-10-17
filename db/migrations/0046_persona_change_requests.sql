-- Wrestler-owned character changes require an authored request and independent
-- fictional wrestler consent. Rejections are durable, not repeatable dice rolls.
CREATE TABLE ppw_persona_change_requests(
 world_id text NOT NULL,request_id text NOT NULL,
 person_id text NOT NULL,promotion_id text NOT NULL,
 requested_gimmick_id text NOT NULL CHECK(length(requested_gimmick_id) BETWEEN 1 AND 100),
 submitted_week_index integer NOT NULL CHECK(submitted_week_index>=0),
 status text NOT NULL CHECK(status IN ('ACCEPTED','DECLINED')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 120),
 assessed_resistance double precision NOT NULL CHECK(assessed_resistance BETWEEN 0 AND 100),
 prior_revision integer,
 resulting_revision integer,
 PRIMARY KEY(world_id,request_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_persona_requests_person_recent
 ON ppw_persona_change_requests(world_id,person_id,submitted_week_index DESC);
CREATE INDEX ppw_persona_requests_promotion_recent
 ON ppw_persona_change_requests(world_id,promotion_id,submitted_week_index DESC);
