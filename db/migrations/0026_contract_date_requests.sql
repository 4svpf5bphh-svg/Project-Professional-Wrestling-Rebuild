-- A request is a proposal, never an immediate contract mutation.
CREATE TABLE ppw_contract_date_requests (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 request_id text NOT NULL,
 contract_id text NOT NULL,
 promotion_id text NOT NULL,
 person_id text NOT NULL,
 additional_dates integer NOT NULL CHECK(additional_dates BETWEEN 1 AND 104),
 status text NOT NULL DEFAULT 'PENDING'
   CHECK(status IN ('PENDING','ACCEPTED','REJECTED','CANCELLED')),
 created_week_index integer NOT NULL CHECK(created_week_index>=0),
 PRIMARY KEY(world_id,request_id),
 FOREIGN KEY(world_id,contract_id) REFERENCES ppw_contracts(world_id,contract_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE UNIQUE INDEX ppw_one_pending_date_request_per_contract
 ON ppw_contract_date_requests(world_id,contract_id) WHERE status='PENDING';
CREATE INDEX ppw_date_requests_promotion_status
 ON ppw_contract_date_requests(world_id,promotion_id,status,created_week_index);
