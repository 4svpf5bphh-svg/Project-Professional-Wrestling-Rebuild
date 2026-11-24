
-- Optional public editorial; never replaces the certified news or World state.
CREATE TABLE IF NOT EXISTS ppw_weekly_world_editorial(
 world_id text NOT NULL, year integer NOT NULL, week integer NOT NULL,
 state text NOT NULL CHECK(state IN ('PENDING','READY','FAILED','EMPTY')),
 copy_json jsonb, provider_calls integer NOT NULL DEFAULT 0 CHECK(provider_calls BETWEEN 0 AND 1),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 PRIMARY KEY(world_id,year,week),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_world_news_weeks(world_id,year,week) ON DELETE CASCADE,
 CHECK((state='READY' AND copy_json IS NOT NULL AND jsonb_typeof(copy_json)='object'
  AND length(copy_json::text)<=6500) OR (state<>'READY' AND copy_json IS NULL))
);
-- A singleton cross-instance dispatch lease. No database connection is held while waiting.
CREATE TABLE IF NOT EXISTS ppw_groq_dispatch_gate(
 id integer PRIMARY KEY CHECK(id=1), lease_id text NOT NULL,
 next_allowed_at timestamptz NOT NULL
);
