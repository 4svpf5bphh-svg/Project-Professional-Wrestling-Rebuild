-- Retain original PPW evidence-based featured booking concerns.
-- One scoped trust signal per contracted wrestler/promotion; no global morale
-- change for reading messages or fulfilling existing booking obligations.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN source_contract_id text,
 ADD COLUMN promised_role text CHECK(promised_role IN ('MAIN_EVENT','UPPER_CARD')),
 ADD COLUMN observed_match_shows integer CHECK(observed_match_shows>=0),
 ADD COLUMN observed_featured_shows integer CHECK(observed_featured_shows>=0),
 ADD COLUMN assessment_reason text,
 ADD COLUMN trust_delta integer NOT NULL DEFAULT 0 CHECK(trust_delta BETWEEN -4 AND 0),
 ADD CONSTRAINT ppw_backstage_source_contract_fk FOREIGN KEY(world_id,source_contract_id)
 REFERENCES ppw_contracts(world_id,contract_id);
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP','ROLE_USAGE'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_decision_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_decision_check
 CHECK(decision IN ('TALK','DECLINE','PROMISE_APPEARANCE','PROMISE_SEGMENT',
 'PROMISE_FEATURED','EXPLORE_RENEWAL','MEDIATE'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_status_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_status_check
 CHECK(status IN ('PENDING','ANSWERED','DECLINED','PROMISED','FULFILLED','BROKEN','EXCUSED'));
CREATE TABLE ppw_backstage_promotion_trust(
 world_id text NOT NULL,promotion_id text NOT NULL,person_id text NOT NULL,
 trust integer NOT NULL DEFAULT 50 CHECK(trust BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,promotion_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_backstage_role_source ON ppw_backstage_requests
 (world_id,promotion_id,source_contract_id) WHERE kind='ROLE_USAGE';
