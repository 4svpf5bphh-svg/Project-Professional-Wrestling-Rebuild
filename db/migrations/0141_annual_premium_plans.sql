-- Exactly one compact authoritative annual premium calendar per promotion.
-- No 52 materialised weeks and no binary poster data in Neon. A missing row
-- means the existing recurrence remains grandfathered until owner approval.
CREATE TABLE ppw_annual_premium_plans (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 year integer NOT NULL CHECK (year BETWEEN 1 AND 10000),
 events jsonb NOT NULL CHECK (jsonb_typeof(events)='array'
  AND jsonb_array_length(events)<=52),
 tier_at_commit text NOT NULL CHECK(tier_at_commit IN
  ('LOCAL','INDEPENDENT','RISING','NATIONAL','GLOBAL')),
 confirmed_week_index integer NOT NULL CHECK(confirmed_week_index>=0),
 PRIMARY KEY(world_id,promotion_id,year),
 FOREIGN KEY(world_id,promotion_id)
  REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE
);
-- PK covers all year/owner lookups, including the bounded one-year rollover.

-- Existing live/playtest Worlds keep their current-year PPV programme.
-- Only their NEXT year enters the new annual-policy gate. Worlds created
-- after this migration get year-one planning (DEFAULT 1) automatically.
-- This row is small and read with the existing World authority snapshot.
ALTER TABLE ppw_worlds
 ADD COLUMN premium_plan_start_year integer NOT NULL DEFAULT 1
 CHECK (premium_plan_start_year BETWEEN 1 AND 10001);
UPDATE ppw_worlds SET premium_plan_start_year=year+1;
