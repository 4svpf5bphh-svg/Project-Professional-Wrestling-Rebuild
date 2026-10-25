-- Optional certified-show performance bonuses; no World replay may double-credit.
CREATE TABLE ppw_commercial_bonus_receipts(
 world_id text NOT NULL,
 deal_id text NOT NULL,
 promotion_id text NOT NULL,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 amount bigint NOT NULL CHECK(amount>0),
 crowd_response numeric(5,1) NOT NULL CHECK(crowd_response BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,deal_id,year,week),
 FOREIGN KEY(world_id,deal_id) REFERENCES ppw_commercial_deals(world_id,deal_id)
);
CREATE INDEX ppw_commercial_bonus_owner_week
 ON ppw_commercial_bonus_receipts(world_id,promotion_id,year,week);
