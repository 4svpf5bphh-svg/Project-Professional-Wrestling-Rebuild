-- Normalized original promotion standings, without inferred defaults or backfill.
CREATE TABLE ppw_promotion_standings (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 prestige double precision NOT NULL CHECK(prestige BETWEEN 0 AND 100),
 fan_reputation double precision NOT NULL CHECK(fan_reputation BETWEEN 0 AND 100),
 business_reputation double precision NOT NULL CHECK(business_reputation BETWEEN 0 AND 100),
 talent_reputation double precision NOT NULL CHECK(talent_reputation BETWEEN 0 AND 100),
 last_evaluated_year integer NOT NULL CHECK(last_evaluated_year BETWEEN 0 AND 100000),
 PRIMARY KEY(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id)
  REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE
);
