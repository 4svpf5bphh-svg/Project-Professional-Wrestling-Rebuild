-- Phase 6 is independent of draft Phase 5, whose reserved filename is 0095.
-- Keep the original economic profiles as baseline; explicit contracts are
-- first-class records, not invented weekly player bonuses.
CREATE TABLE ppw_commercial_deals (
 world_id text NOT NULL,
 deal_id text NOT NULL,
 promotion_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('BROADCAST','SPONSOR')),
 offer_code text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','EXPIRED')),
 baseline_income bigint NOT NULL CHECK(baseline_income>=0),
 agreed_income bigint NOT NULL CHECK(agreed_income>=0),
 baseline_reach double precision,
 agreed_reach double precision,
 start_week_index integer NOT NULL CHECK(start_week_index>=0),
 end_week_index integer NOT NULL CHECK(end_week_index>=start_week_index),
 source text NOT NULL CHECK(source IN ('HUMAN','AI')),
 PRIMARY KEY(world_id,deal_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 CHECK(kind='BROADCAST' OR (baseline_reach IS NULL AND agreed_reach IS NULL))
);
CREATE UNIQUE INDEX ppw_active_commercial_kind
 ON ppw_commercial_deals(world_id,promotion_id,kind) WHERE status='ACTIVE';
CREATE INDEX ppw_commercial_expiry
 ON ppw_commercial_deals(world_id,end_week_index) WHERE status='ACTIVE';
CREATE INDEX ppw_commercial_owner
 ON ppw_commercial_deals(world_id,promotion_id,status);
