-- Keep dismissal in the existing owner-scoped answer table.
ALTER TABLE ppw_premium_media_scrum_answers
 DROP CONSTRAINT IF EXISTS ppw_premium_media_scrum_answers_question_id_check;
ALTER TABLE ppw_premium_media_scrum_answers
 ADD CONSTRAINT ppw_premium_media_scrum_answers_question_id_check
 CHECK (question_id IN ('MAIN_EVENT','BIG_PICTURE','NEXT_CHAPTER','DISMISSED'));
