-- Private categorical diagnostics for rejected fictional Groq 20B output.
-- Only fixed result labels are stored: never the rejected model prose.
ALTER TABLE ppw_shortform_ai_lab_runs
 ADD COLUMN IF NOT EXISTS diagnostics_json jsonb;
