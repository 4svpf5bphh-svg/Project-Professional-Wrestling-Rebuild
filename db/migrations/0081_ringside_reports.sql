-- Read-only editorial layer. It must not participate in World resolution locks.
CREATE TABLE ppw_ringside_reports (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 show_id text NOT NULL,
 prompt_version text NOT NULL,
 receipt_digest text NOT NULL,
 model text NOT NULL,
 state text NOT NULL CHECK (state IN ('PENDING','READY','FAILED')),
 attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 2),
 claim_token text NOT NULL,
 claim_until timestamptz NOT NULL,
 report_json jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (world_id,promotion_id,show_id,prompt_version),
 FOREIGN KEY (world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id),
 FOREIGN KEY (world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 CHECK ((state='READY') = (report_json IS NOT NULL))
);
