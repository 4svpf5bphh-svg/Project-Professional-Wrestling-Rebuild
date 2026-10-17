-- Original PPW rivalry pitches use certified singles matches and real
-- professional trust. Accepting a suggestion never creates a scripted programme.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN rival_verified_matches integer CHECK(rival_verified_matches>=0),
 ADD COLUMN rival_professional_trust numeric(5,1)
  CHECK(rival_professional_trust BETWEEN -100 AND 100);
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
 'ROLE_USAGE','GIMMICK_PITCH','TAG_TEAM_PITCH','RIVALRY_PITCH'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_decision_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_decision_check
 CHECK(decision IN ('TALK','DECLINE','PROMISE_APPEARANCE','PROMISE_SEGMENT',
 'PROMISE_FEATURED','EXPLORE_RENEWAL','MEDIATE','CONSIDER_REPACKAGE',
 'KEEP_CHARACTER','EXPLORE_TEAM','NOT_NOW','EXPLORE_RIVALRY'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_follow_through_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_follow_through_kind_check
 CHECK(follow_through_kind IN ('TAG_MATCH_BOOKED','RIVALRY_PROGRAMME_STARTED'));
CREATE INDEX ppw_backstage_rivalry_followup
 ON ppw_backstage_requests(world_id,promotion_id,responded_week_index)
 WHERE kind='RIVALRY_PITCH' AND decision='EXPLORE_RIVALRY'
 AND follow_through_week_index IS NULL;
