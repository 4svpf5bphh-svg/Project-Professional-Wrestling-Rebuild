ALTER TABLE ppw_contracts
 ADD COLUMN start_week_index integer NOT NULL DEFAULT 0 CHECK(start_week_index>=0),
 ADD COLUMN date_entitlement integer CHECK(date_entitlement BETWEEN 1 AND 104),
 ADD COLUMN weekly_guarantee bigint NOT NULL DEFAULT 0 CHECK(weekly_guarantee>=0),
 ADD COLUMN appearance_fee bigint NOT NULL DEFAULT 0 CHECK(appearance_fee>=0),
 ADD COLUMN signing_bonus bigint NOT NULL DEFAULT 0 CHECK(signing_bonus>=0),
 ADD COLUMN role_expectation text NOT NULL DEFAULT 'MIDCARD',
 ADD COLUMN creative_control text NOT NULL DEFAULT 'NONE';
CREATE TABLE ppw_contract_renewal_proposals(
 world_id text NOT NULL,proposal_id text NOT NULL,contract_id text NOT NULL,
 promotion_id text NOT NULL,person_id text NOT NULL,
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACCEPTED','REJECTED','WITHDRAWN')),
 created_week_index integer NOT NULL CHECK(created_week_index>=0),
 proposed_terms jsonb NOT NULL,
 PRIMARY KEY(world_id,proposal_id),
 FOREIGN KEY(world_id,contract_id) REFERENCES ppw_contracts(world_id,contract_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE UNIQUE INDEX ppw_one_pending_renewal ON ppw_contract_renewal_proposals(world_id,contract_id) WHERE status='PENDING';
