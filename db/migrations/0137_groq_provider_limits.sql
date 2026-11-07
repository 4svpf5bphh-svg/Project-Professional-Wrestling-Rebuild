-- Provider-reported limits are snapshots of a response, not a live balance.
-- Requests reflect Groq's RPD; tokens reflect its TPM. No extra query or
-- provider call is made. No headers, credentials or prompt data are retained.
ALTER TABLE ppw_groq_daily_usage
 ADD COLUMN IF NOT EXISTS provider_rpd_limit integer CHECK(provider_rpd_limit>=0),
 ADD COLUMN IF NOT EXISTS provider_rpd_remaining integer CHECK(provider_rpd_remaining>=0),
 ADD COLUMN IF NOT EXISTS provider_tpm_limit integer CHECK(provider_tpm_limit>=0),
 ADD COLUMN IF NOT EXISTS provider_tpm_remaining integer CHECK(provider_tpm_remaining>=0),
 ADD COLUMN IF NOT EXISTS provider_last_model text,
 ADD COLUMN IF NOT EXISTS provider_limit_observed_at timestamptz;
