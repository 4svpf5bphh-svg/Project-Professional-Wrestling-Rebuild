-- Preserve wrestler career context at the moment a private request is created.
-- Older archived requests stay unchanged and retain their original dialogue.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN career_stage_at_request text
 CHECK(career_stage_at_request IN ('PROSPECT','PRIME','VETERAN','SPECIAL_ATTRACTION'));
