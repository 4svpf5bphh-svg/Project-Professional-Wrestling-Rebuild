-- Safe shared monthly spend control for manual Terra quality previews.
-- Micropounds are conservatively charged using GBP >= USD and 2x public
-- standard Terra token rates; £3 is 3,000,000 micropounds. No World changes.
CREATE TABLE IF NOT EXISTS ppw_openai_preview_monthly_usage (
 usage_month date PRIMARY KEY,
 call_count integer NOT NULL DEFAULT 0 CHECK (call_count >= 0),
 reserved_micropounds bigint NOT NULL DEFAULT 0 CHECK (reserved_micropounds >= 0),
 spent_micropounds bigint NOT NULL DEFAULT 0 CHECK (spent_micropounds >= 0),
 reported_input_tokens bigint NOT NULL DEFAULT 0 CHECK (reported_input_tokens >= 0),
 reported_output_tokens bigint NOT NULL DEFAULT 0 CHECK (reported_output_tokens >= 0)
);
