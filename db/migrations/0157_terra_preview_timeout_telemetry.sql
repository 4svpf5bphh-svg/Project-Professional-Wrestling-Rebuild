-- Extend the existing owner-only AI Lab error enum, not the World schema.
-- Idempotent and preserves every previous failure/sample.
ALTER TABLE ppw_ai_lab_runs
 DROP CONSTRAINT IF EXISTS ppw_ai_lab_runs_error_code_check,
 ADD CONSTRAINT ppw_ai_lab_runs_error_code_check
 CHECK(error_code IN ('FACT_VALIDATION','PROVIDER_LIMIT','PROVIDER_AUTH',
 'PROVIDER_ERROR','INVALID_OUTPUT','OUTPUT_INCOMPLETE','TIMEOUT','UNKNOWN'));
