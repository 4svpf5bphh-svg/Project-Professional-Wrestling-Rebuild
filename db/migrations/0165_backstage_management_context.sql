BEGIN;

SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Hold off World commands between the guard and the catalog changes.
LOCK TABLE ppw_worlds IN SHARE MODE;
DO $guard$
DECLARE
 existing_kinds text[];
 expected_kinds constant text[] := ARRAY[
  'BOOKING_OMISSION','CONTRACT','CREATIVE','GIMMICK_PITCH','LOSS_STREAK',
  'MEDICAL_SUPPORT','MENTORSHIP_PITCH','MOMENTUM','MORALE','PARTNERSHIP',
  'RIVALRY_PITCH','ROLE_USAGE','TAG_TEAM_PITCH','TEAM_MOMENT','TITLE_AMBITION','TRUST_CHECK_IN'
 ];
BEGIN
 IF EXISTS (SELECT 1 FROM ppw_worlds WHERE phase <> 'OPEN')
 OR EXISTS (SELECT 1 FROM ppw_world_update_runs WHERE state = 'ACTIVE') THEN
  RAISE EXCEPTION 'Finish World resolution and pause booking traffic before applying 0165';
 END IF;
 SELECT array_agg(captures[1] ORDER BY captures[1] COLLATE "C") INTO existing_kinds
 FROM pg_constraint c CROSS JOIN LATERAL
  regexp_matches(pg_get_constraintdef(c.oid), $$'([A-Z_]+)'$$, 'g') AS captures
 WHERE c.conrelid='ppw_backstage_requests'::regclass
  AND c.conname='ppw_backstage_requests_kind_check' AND c.contype='c'
  AND c.convalidated;
 IF existing_kinds IS DISTINCT FROM expected_kinds AND
  array_remove(existing_kinds,'MOMENTUM_OPPORTUNITY') IS DISTINCT FROM expected_kinds THEN
  RAISE EXCEPTION 'Unexpected Backstage kind constraint before 0165: %', existing_kinds;
 END IF;
END
$guard$;

-- Keep the facts behind a private request with its existing conversation.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN IF NOT EXISTS management_context jsonb
  CHECK (management_context IS NULL OR jsonb_typeof(management_context)='object'),
 ADD COLUMN IF NOT EXISTS first_opportunity_week_index integer
  CHECK (first_opportunity_week_index BETWEEN responded_week_index AND due_week_index),
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

COMMIT;
