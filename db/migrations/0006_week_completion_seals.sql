-- A weekly resolution may not be published without an explicit certification
-- from the future server-only conflict / AI / staff resolution pipeline.
-- One compact row per World week, never one per card slot or player poll.
CREATE TABLE ppw_week_resolution_seals (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  year integer NOT NULL CHECK (year > 0),
  week integer NOT NULL CHECK (week BETWEEN 1 AND 52),
  certified_promotions integer NOT NULL CHECK (certified_promotions > 0),
  certified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (world_id,year,week)
);
