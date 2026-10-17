-- Positive tag chemistry pitch from settled World match evidence. An "explore"
-- choice never creates a tag team; subsequent booking is player-authored.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN team_verified_matches integer CHECK(team_verified_matches>=0),
 ADD COLUMN observed_execution_quality numeric(5,1)
 CHECK(observed_execution_quality BETWEEN 0 AND 100),
 ADD COLUMN follow_through_week_index integer
 CHECK(follow_through_week_index>=0),
 ADD COLUMN follow_through_kind text
 CHECK(follow_through_kind IN ('TAG_MATCH_BOOKED')),
 ADD CONSTRAINT ppw_backstage_follow_through_coherence CHECK (
  (follow_through_week_index IS NULL)=(follow_through_kind IS NULL)
 );
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
  'ROLE_USAGE','GIMMICK_PITCH','TAG_TEAM_PITCH'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_decision_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_decision_check
 CHECK(decision IN ('TALK','DECLINE','PROMISE_APPEARANCE','PROMISE_SEGMENT',
  'PROMISE_FEATURED','EXPLORE_RENEWAL','MEDIATE',
  'CONSIDER_REPACKAGE','KEEP_CHARACTER','EXPLORE_TEAM','NOT_NOW'));
CREATE INDEX ppw_backstage_tag_followup
 ON ppw_backstage_requests(world_id,promotion_id,responded_week_index)
 WHERE kind='TAG_TEAM_PITCH' AND decision='EXPLORE_TEAM'
 AND follow_through_week_index IS NULL;
