-- Mediation notes only what was genuinely booked and completed.
-- Unlike a click-to-repair mechanic, this never grants unearned trust.
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_follow_through_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_follow_through_kind_check
 CHECK(follow_through_kind IN ('TAG_MATCH_BOOKED','RIVALRY_PROGRAMME_STARTED',
 'MEDIATION_MATCH_COMPLETED'));
CREATE INDEX ppw_backstage_mediation_followup ON ppw_backstage_requests
 (world_id,promotion_id,responded_week_index)
 WHERE kind='PARTNERSHIP' AND decision='MEDIATE'
 AND follow_through_week_index IS NULL;
