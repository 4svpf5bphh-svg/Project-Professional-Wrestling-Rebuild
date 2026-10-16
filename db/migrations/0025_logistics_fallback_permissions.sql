-- Explicit pre-lock logistics delegation. Creative authority never transfers.
ALTER TABLE ppw_staff_continuity_settings
 ADD COLUMN allow_logistics_fallback boolean NOT NULL DEFAULT false,
 ADD COLUMN permitted_days smallint[] NOT NULL DEFAULT ARRAY[]::smallint[],
 ADD COLUMN permitted_venue_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
 ADD CONSTRAINT ppw_logistics_days_valid CHECK (
  array_position(permitted_days,NULL) IS NULL
  AND permitted_days <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  AND cardinality(permitted_days)<=7),
 ADD CONSTRAINT ppw_logistics_venues_valid CHECK (
  array_position(permitted_venue_ids,NULL) IS NULL
  AND cardinality(permitted_venue_ids)<=32);
-- Frozen per World-week: subsequent owner/setting changes cannot grant
-- retroactive authority for an already locked week.
CREATE TABLE ppw_week_logistics_authorizations (
 world_id text NOT NULL,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 promotion_id text NOT NULL,
 controller_player_id text NOT NULL,
 allow_logistics_fallback boolean NOT NULL,
 permitted_days smallint[] NOT NULL,
 permitted_venue_ids text[] NOT NULL,
 PRIMARY KEY(world_id,year,week,promotion_id),
 FOREIGN KEY(world_id,year,week,promotion_id)
  REFERENCES ppw_week_continuity_assessments(world_id,year,week,promotion_id)
);
