-- Phase 3: private, evidence-backed memory, retained beyond the thread but never public.
-- All entries identify canonical events; no AI-generated claims or new World clock.
CREATE TABLE ppw_backstage_memories(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 person_id text NOT NULL,
 memory_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN (
  'PROMISE_MADE','PROMISE_KEPT','PROMISE_BROKEN','PROMISE_EXCUSED',
  'REQUEST_DECLINED','REQUEST_HEARD','CONTRACT_FOLLOW_THROUGH',
  'CREATIVE_FOLLOW_THROUGH','MEDICAL_ABSENCE','TITLE_WON','TITLE_CHALLENGE',
  'CHARACTER_APPROVED','CHARACTER_DECLINED')),
 occurred_week_index integer NOT NULL CHECK(occurred_week_index>=0),
 importance smallint NOT NULL CHECK(importance BETWEEN 1 AND 5),
 source_id text NOT NULL,
 PRIMARY KEY(world_id,promotion_id,person_id,memory_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE,
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id) ON DELETE CASCADE
);
CREATE INDEX ppw_backstage_memory_recent ON ppw_backstage_memories
 (world_id,promotion_id,person_id,occurred_week_index DESC,memory_id DESC);
CREATE INDEX ppw_backstage_memory_cooldown ON ppw_backstage_memories
 (world_id,promotion_id,person_id,kind,occurred_week_index DESC);
CREATE INDEX ppw_backstage_response_window ON ppw_backstage_requests
 (world_id,responded_week_index) WHERE responded_week_index IS NOT NULL;
CREATE INDEX ppw_backstage_followthrough_window ON ppw_backstage_requests
 (world_id,follow_through_week_index) WHERE follow_through_week_index IS NOT NULL;
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
 'ROLE_USAGE','GIMMICK_PITCH','TAG_TEAM_PITCH','RIVALRY_PITCH','TEAM_MOMENT',
 'MEDICAL_SUPPORT','BOOKING_OMISSION','LOSS_STREAK','TITLE_AMBITION','TRUST_CHECK_IN'));
ALTER TABLE ppw_backstage_requests
 ADD COLUMN observed_absent_weeks integer CHECK(observed_absent_weeks>=0),
 ADD COLUMN observed_losses integer CHECK(observed_losses>=0),
 ADD COLUMN relevant_title text CHECK(relevant_title IS NULL OR length(relevant_title)<=240);
