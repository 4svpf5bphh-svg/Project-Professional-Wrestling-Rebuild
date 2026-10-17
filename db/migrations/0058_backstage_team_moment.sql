-- Genuine locker-room good news from completed tag work, never a player request.
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
 'ROLE_USAGE','GIMMICK_PITCH','TAG_TEAM_PITCH','RIVALRY_PITCH','TEAM_MOMENT'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_status_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_status_check
 CHECK(status IN ('PENDING','ANSWERED','DECLINED','PROMISED','FULFILLED',
 'BROKEN','EXCUSED','NOTED'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_decision_coherence;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_decision_coherence
 CHECK(
  (status IN ('PENDING','NOTED') AND decision IS NULL AND responded_week_index IS NULL)
  OR (status='EXCUSED' AND
    ((decision IS NULL AND responded_week_index IS NULL)
    OR (decision IS NOT NULL AND responded_week_index IS NOT NULL)))
  OR (status NOT IN ('PENDING','NOTED','EXCUSED') AND
    decision IS NOT NULL AND responded_week_index IS NOT NULL)
 );
