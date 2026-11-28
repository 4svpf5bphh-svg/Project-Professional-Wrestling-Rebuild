BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE ppw_backstage_requests
 ADD COLUMN promised_championship_id text,
 ADD CONSTRAINT ppw_backstage_promised_championship_fk
 FOREIGN KEY(world_id,promotion_id,promised_championship_id)
 REFERENCES ppw_championships(world_id,promotion_id,championship_id);
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_decision_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_decision_check
 CHECK(decision IN ('TALK','DECLINE','PROMISE_APPEARANCE','PROMISE_SEGMENT',
 'PROMISE_FEATURED','EXPLORE_RENEWAL','MEDIATE','CONSIDER_REPACKAGE',
 'KEEP_CHARACTER','EXPLORE_TEAM','EXPLORE_RIVALRY','NOT_NOW',
 'EXPLORE_MENTORSHIP','PROMISE_TITLE_MATCH'));
CREATE INDEX ppw_backstage_open_promises
 ON ppw_backstage_requests(world_id,promotion_id,due_week_index,request_id) WHERE status='PROMISED';
CREATE INDEX ppw_backstage_promise_history
 ON ppw_backstage_requests(world_id,promotion_id,responded_week_index DESC,request_id DESC)
 WHERE decision IN ('PROMISE_APPEARANCE','PROMISE_SEGMENT','PROMISE_FEATURED','PROMISE_TITLE_MATCH','EXPLORE_RENEWAL')
  AND responded_week_index IS NOT NULL;

ALTER TABLE ppw_backstage_staff_replies ADD COLUMN programme_id text;
ALTER TABLE ppw_backstage_staff_replies ADD CONSTRAINT ppw_staff_reply_programme_fk
 FOREIGN KEY(world_id,promotion_id,programme_id)
 REFERENCES ppw_programmes(world_id,promotion_id,programme_id);

COMMIT;
