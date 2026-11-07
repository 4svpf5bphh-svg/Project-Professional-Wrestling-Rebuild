-- Small, contention-safe global editorial budget, independent of Worlds.
-- Reapplying is safe; no player data or historical articles are rewritten.
CREATE TABLE IF NOT EXISTS ppw_groq_daily_usage(
 usage_day date PRIMARY KEY,
 call_count integer NOT NULL DEFAULT 0 CHECK (call_count>=0),
 reserved_tokens integer NOT NULL DEFAULT 0 CHECK (reserved_tokens>=0),
 reported_input_tokens bigint NOT NULL DEFAULT 0 CHECK (reported_input_tokens>=0),
 reported_output_tokens bigint NOT NULL DEFAULT 0 CHECK (reported_output_tokens>=0),
 completed_calls integer NOT NULL DEFAULT 0 CHECK (completed_calls>=0),
 failed_calls integer NOT NULL DEFAULT 0 CHECK (failed_calls>=0)
);
