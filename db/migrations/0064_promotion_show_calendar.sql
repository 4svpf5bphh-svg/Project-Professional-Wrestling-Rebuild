-- Persist show identities, not 52 duplicated weekly occurrences.
-- Regular A/B slots alternate; premium PPVs have a separate identity.
CREATE TABLE ppw_show_series (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 series_id text NOT NULL CHECK (length(series_id) BETWEEN 1 AND 200),
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
 role text NOT NULL CHECK (role IN
  ('FLAGSHIP','SECONDARY','DEVELOPMENTAL','SPECIAL','PREMIUM')),
 event_type text NOT NULL CHECK (event_type IN ('REGULAR','MAJOR')),
 cadence_weeks integer NOT NULL CHECK (cadence_weeks BETWEEN 1 AND 260),
 anchor_week integer NOT NULL CHECK (anchor_week >= 0 AND anchor_week < cadence_weeks),
 importance integer NOT NULL CHECK (importance BETWEEN 1 AND 100),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(world_id,promotion_id,series_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_calendar_active_series ON ppw_show_series(world_id,promotion_id)
 WHERE active;
