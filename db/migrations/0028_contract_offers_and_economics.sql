-- Original PPW contract economics are person-owned, not a World snapshot.
-- NULL means the original wrestler profile is not yet imported: fail closed.
ALTER TABLE ppw_people
 ADD COLUMN career_stage text CHECK (career_stage IN ('PROSPECT','PRIME','VETERAN','SPECIAL_ATTRACTION')),
 ADD COLUMN contract_priorities jsonb,
 ADD COLUMN morale double precision CHECK (morale BETWEEN 0 AND 100);
ALTER TABLE ppw_worlds
 ADD COLUMN offer_acceptance_threshold double precision NOT NULL DEFAULT 50
 CHECK (offer_acceptance_threshold BETWEEN 0 AND 100);
CREATE TABLE ppw_contract_offers (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 offer_id text NOT NULL,
 person_id text NOT NULL,
 promotion_id text NOT NULL,
 source_contract_id text,
 submitted_week_index integer NOT NULL CHECK (submitted_week_index >= 0),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
 terms jsonb NOT NULL,
 resolved_utility double precision,
 rejection_reason text,
 PRIMARY KEY(world_id,offer_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,source_contract_id) REFERENCES ppw_contracts(world_id,contract_id)
);
CREATE UNIQUE INDEX ppw_one_pending_offer_per_person_promotion
 ON ppw_contract_offers(world_id,promotion_id,person_id) WHERE status='PENDING';
CREATE INDEX ppw_offer_resolve_person
 ON ppw_contract_offers(world_id,person_id,submitted_week_index,offer_id)
 WHERE status='PENDING';
CREATE INDEX ppw_offer_desk
 ON ppw_contract_offers(world_id,promotion_id,status,submitted_week_index DESC);

ALTER TABLE ppw_contract_date_requests
 ADD COLUMN additional_payment bigint NOT NULL DEFAULT 0 CHECK(additional_payment BETWEEN 0 AND 1000000000);
ALTER TABLE ppw_contract_renewal_proposals DROP CONSTRAINT ppw_contract_renewal_proposals_status_check;
ALTER TABLE ppw_contract_renewal_proposals ADD CONSTRAINT ppw_contract_renewal_proposals_status_check
 CHECK(status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN','ACTIVATED'));
CREATE UNIQUE INDEX ppw_one_accepted_renewal_per_contract
 ON ppw_contract_renewal_proposals(world_id,contract_id) WHERE status='ACCEPTED';
