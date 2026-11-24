-- Extend only the private operator's fictional benchmark catalogue.
ALTER TABLE ppw_shortform_ai_lab_runs DROP CONSTRAINT IF EXISTS ppw_shortform_ai_lab_runs_scenario_id_check;
ALTER TABLE ppw_shortform_ai_lab_runs ADD CONSTRAINT ppw_shortform_ai_lab_runs_scenario_id_check
 CHECK(scenario_id IN ('i-quit','steel-cage','tag-standard','mixed-broadcast'));
