BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE ppw_delegated_contract_renewals (
 world_id text NOT NULL,
 request_id text NOT NULL,
 promotion_id text NOT NULL,
 owner_player_id text NOT NULL,
 contract_id text NOT NULL,
 source_start_week_index integer NOT NULL,
 created_week_index integer NOT NULL,
 strategy text NOT NULL CHECK(strategy IN ('EXISTING_TERMS','PRIORITY_RETENTION','BALANCED','REDUCE_COSTS')),
 max_weekly_guarantee bigint NOT NULL CHECK(max_weekly_guarantee BETWEEN 0 AND 1000000000),
 max_appearance_fee bigint NOT NULL CHECK(max_appearance_fee BETWEEN 0 AND 1000000000),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SUBMITTED','UNABLE','WITHDRAWN')),
 processed_week_index integer,
 PRIMARY KEY(world_id,request_id),
 FOREIGN KEY(world_id,contract_id) REFERENCES ppw_contracts(world_id,contract_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE UNIQUE INDEX ppw_one_queued_delegated_renewal
 ON ppw_delegated_contract_renewals(world_id,contract_id) WHERE status='QUEUED';
CREATE INDEX ppw_delegated_renewal_inbox
 ON ppw_delegated_contract_renewals(world_id,promotion_id,owner_player_id,created_week_index DESC);

ALTER TABLE ppw_contract_offers ADD COLUMN counter_terms jsonb
 CHECK(counter_terms IS NULL OR jsonb_typeof(counter_terms)='object');
ALTER TABLE ppw_contract_renewal_proposals ADD COLUMN resolved_week_index integer;
CREATE INDEX ppw_renewal_result_recent ON ppw_contract_renewal_proposals
 (world_id,promotion_id,coalesce(resolved_week_index,created_week_index) DESC)
 WHERE status IN ('ACCEPTED','ACTIVATED','REJECTED') AND proposal_id NOT LIKE 'accepted:%';

COMMIT;
