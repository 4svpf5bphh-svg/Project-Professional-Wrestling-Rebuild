-- An expired roster contact must never require an invented player reply.
-- EXCUSED may represent (a) an unanswered request automatically closed by a
-- departing contract, or (b) an authored promise with a valid due week.
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_check;
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_check1;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_decision_coherence
 CHECK(
 (status='PENDING' AND decision IS NULL AND responded_week_index IS NULL)
 OR (status='EXCUSED' AND ((decision IS NULL AND responded_week_index IS NULL)
 OR (decision IS NOT NULL AND responded_week_index IS NOT NULL)))
 OR (status NOT IN ('PENDING','EXCUSED') AND decision IS NOT NULL
 AND responded_week_index IS NOT NULL)
 );
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_due_coherence
 CHECK(
 (status IN ('PROMISED','FULFILLED','BROKEN') AND due_week_index IS NOT NULL)
 OR (status='EXCUSED' AND
  ((decision IS NULL AND due_week_index IS NULL)
  OR (decision IS NOT NULL AND due_week_index IS NOT NULL)))
 OR (status NOT IN ('PROMISED','FULFILLED','BROKEN','EXCUSED')
 AND due_week_index IS NULL)
 );
