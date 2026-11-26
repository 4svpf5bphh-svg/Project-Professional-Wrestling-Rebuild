-- Keep the facts behind a private request with its existing conversation.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN IF NOT EXISTS management_context jsonb
  CHECK (management_context IS NULL OR jsonb_typeof(management_context)='object'),
 ADD COLUMN IF NOT EXISTS settled_week_index integer
  CHECK (settled_week_index IS NULL OR settled_week_index>=responded_week_index);

ALTER TABLE ppw_backstage_requests DROP CONSTRAINT IF EXISTS ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
 'ROLE_USAGE','GIMMICK_PITCH','TAG_TEAM_PITCH','MENTORSHIP_PITCH','RIVALRY_PITCH',
 'TEAM_MOMENT','MEDICAL_SUPPORT','BOOKING_OMISSION','LOSS_STREAK','TITLE_AMBITION',
 'TRUST_CHECK_IN','MOMENTUM_OPPORTUNITY'));

CREATE INDEX IF NOT EXISTS ppw_backstage_memory_retention
 ON ppw_backstage_memories(world_id,occurred_week_index);
