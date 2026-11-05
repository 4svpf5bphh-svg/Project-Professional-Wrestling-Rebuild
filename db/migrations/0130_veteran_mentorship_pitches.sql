-- Phase 31: experienced wrestler mentorship is only offered after real tag
-- teamwork with a prospect. Reuse World Lock's current bounded pitch query.
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
 'ROLE_USAGE','GIMMICK_PITCH','TAG_TEAM_PITCH','RIVALRY_PITCH','TEAM_MOMENT',
 'MEDICAL_SUPPORT','BOOKING_OMISSION','LOSS_STREAK','TITLE_AMBITION',
 'TRUST_CHECK_IN','MENTORSHIP_PITCH'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_decision_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_decision_check
 CHECK(decision IN ('TALK','DECLINE','PROMISE_APPEARANCE','PROMISE_SEGMENT',
 'PROMISE_FEATURED','EXPLORE_RENEWAL','MEDIATE','CONSIDER_REPACKAGE',
 'KEEP_CHARACTER','EXPLORE_TEAM','EXPLORE_RIVALRY','NOT_NOW',
 'EXPLORE_MENTORSHIP'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_follow_through_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_follow_through_kind_check
 CHECK(follow_through_kind IN ('TAG_MATCH_BOOKED','RIVALRY_PROGRAMME_STARTED',
 'MEDIATION_MATCH_COMPLETED','CONTRACT_NEGOTIATION_STARTED',
 'MENTORSHIP_MATCH_COMPLETED'));
