-- This division is booking eligibility for the emergency staff card, not
-- an assertion about biological characteristics or an all-purpose identity.
-- Unknown is deliberately NULL until the canonical roster is migrated.
ALTER TABLE ppw_people ADD COLUMN booking_division text
  CHECK (booking_division IS NULL OR booking_division IN ('MEN','WOMEN'));
ALTER TABLE ppw_booking_drafts ADD COLUMN booking_origin text NOT NULL DEFAULT 'PLAYER'
  CHECK (booking_origin IN ('PLAYER','STAFF_FALLBACK'));

-- One durable receipt per World/week, including explicit unfilled cases.
CREATE TABLE ppw_week_staff_fallback_runs (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  year integer NOT NULL CHECK(year>0),
  week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
  generated_count integer NOT NULL CHECK(generated_count>=0),
  unfilled_count integer NOT NULL CHECK(unfilled_count>=0),
  command_request_id text NOT NULL,
  PRIMARY KEY(world_id,year,week),
  UNIQUE(world_id,command_request_id)
);
