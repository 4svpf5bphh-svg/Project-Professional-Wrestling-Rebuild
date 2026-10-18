CREATE TABLE ppw_match_creative_consents(
 world_id text NOT NULL,
 show_id text NOT NULL,
 slot_id text NOT NULL,
 person_id text NOT NULL,
 contract_id text NOT NULL,
 signature text NOT NULL CHECK(signature ~ '^[0-9a-f]{64}$'),
 decision text NOT NULL CHECK(decision IN ('APPROVED','DECLINED')),
 score integer NOT NULL CHECK(score BETWEEN 0 AND 100),
 decided_week_index integer NOT NULL CHECK(decided_week_index>=0),
 PRIMARY KEY(world_id,show_id,slot_id,person_id,contract_id,signature),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_booking_drafts(world_id,draft_id) ON DELETE CASCADE,
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,contract_id) REFERENCES ppw_contracts(world_id,contract_id)
);
CREATE INDEX ppw_match_creative_show ON ppw_match_creative_consents(world_id,show_id);
