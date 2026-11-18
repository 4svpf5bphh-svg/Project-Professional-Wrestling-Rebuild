-- Genuine solo/relationship/faction storylines reuse the original Programme
-- authority, certified angle history and rev-checked World commands.
-- No new tables, cron or query are needed. Existing rivalries default to
-- RIVALRY and retain their symmetrical identity and original participants.
ALTER TABLE ppw_programmes
 ADD COLUMN IF NOT EXISTS programme_format text NOT NULL DEFAULT 'RIVALRY';
ALTER TABLE ppw_programmes
 DROP CONSTRAINT IF EXISTS ppw_programmes_programme_format_check;
ALTER TABLE ppw_programmes
 ADD CONSTRAINT ppw_programmes_programme_format_check
 CHECK(programme_format IN ('RIVALRY','SOLO','RELATIONSHIP','FACTION'));
-- Existing original participants had 0–1 positions per side; non-rival
-- multi-actor journeys can contain up to five individual characters on A.
ALTER TABLE ppw_programme_side_refs
 DROP CONSTRAINT IF EXISTS ppw_programme_side_refs_position_check;
ALTER TABLE ppw_programme_side_refs
 ADD CONSTRAINT ppw_programme_side_refs_position_check
 CHECK(position BETWEEN 0 AND 4);
