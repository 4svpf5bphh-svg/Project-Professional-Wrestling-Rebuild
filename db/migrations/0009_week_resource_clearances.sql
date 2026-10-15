-- Resource clearance comes BEFORE any show appearance charges, not after.
-- The permanent one-row-per-World-week receipt allows bounded, restart-safe
-- server resolution without duplicating scarce resource allocations.
CREATE TABLE ppw_week_resource_clearances (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  year integer NOT NULL CHECK (year>0),
  week integer NOT NULL CHECK (week BETWEEN 1 AND 52),
  eligible_promotions integer NOT NULL CHECK (eligible_promotions>0),
  inspected_slots integer NOT NULL CHECK (inspected_slots>0),
  command_request_id text NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(world_id,year,week),
  UNIQUE(world_id,command_request_id)
);
-- A pre-clearance worker only checks for show resolutions in the CURRENT
-- World week, not all historical receipts.
CREATE INDEX ppw_show_resolutions_world_week
  ON ppw_show_resolutions(world_id,resolved_week_index);
