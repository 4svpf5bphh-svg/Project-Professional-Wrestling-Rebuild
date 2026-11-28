BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;

-- Pause booking and advancement writers before applying. Hold these locks
-- across the idle check and DDL so a World cannot start resolving in between.
LOCK TABLE ppw_worlds, ppw_world_update_runs IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
DECLARE decision_check constant text := $definition$CHECK ((decision = ANY (ARRAY['TALK'::text, 'DECLINE'::text, 'PROMISE_APPEARANCE'::text, 'PROMISE_SEGMENT'::text, 'PROMISE_FEATURED'::text, 'EXPLORE_RENEWAL'::text, 'MEDIATE'::text, 'CONSIDER_REPACKAGE'::text, 'KEEP_CHARACTER'::text, 'EXPLORE_TEAM'::text, 'EXPLORE_RIVALRY'::text, 'NOT_NOW'::text, 'EXPLORE_MENTORSHIP'::text, 'PROMISE_TITLE_MATCH'::text])))$definition$;
BEGIN
 IF EXISTS (SELECT FROM ppw_worlds WHERE phase <> 'OPEN')
 OR EXISTS (SELECT FROM ppw_world_update_runs WHERE state='ACTIVE')
 THEN RAISE EXCEPTION '0170 requires idle Worlds'; END IF;

 -- A committed retry verifies the catalogue without replacing existing objects.
 IF to_regclass('public.ppw_renewal_result_recent') IS NULL THEN
  RAISE EXCEPTION '0170 requires 0169 first';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid='ppw_backstage_requests'::regclass
  AND attname='promised_championship_id' AND NOT attisdropped) THEN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
   WHERE conrelid='ppw_backstage_requests'::regclass AND conname='ppw_backstage_requests_decision_check'
    AND convalidated
  ) IS DISTINCT FROM replace(decision_check, ', ''PROMISE_TITLE_MATCH''::text','') THEN
   RAISE EXCEPTION '0170 unexpected previous Backstage decisions';
  END IF;
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
 END IF;


 IF EXISTS (
  SELECT FROM (VALUES
   ('ppw_backstage_requests'::regclass,'promised_championship_id','text'),
   ('ppw_backstage_staff_replies'::regclass,'programme_id','text')
  ) expected(table_id,column_name,type_name)
  WHERE NOT EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=expected.table_id
   AND a.attname=expected.column_name AND format_type(a.atttypid,a.atttypmod)=expected.type_name
   AND NOT a.attnotnull AND NOT a.attisdropped AND NOT a.atthasdef)
 ) OR EXISTS (
  SELECT FROM (VALUES
   ('ppw_backstage_requests'::regclass,'ppw_backstage_requests_decision_check',decision_check),
   ('ppw_backstage_requests'::regclass,'ppw_backstage_promised_championship_fk',$definition$FOREIGN KEY (world_id, promotion_id, promised_championship_id) REFERENCES ppw_championships(world_id, promotion_id, championship_id)$definition$),
   ('ppw_backstage_staff_replies'::regclass,'ppw_staff_reply_programme_fk',$definition$FOREIGN KEY (world_id, promotion_id, programme_id) REFERENCES ppw_programmes(world_id, promotion_id, programme_id)$definition$)
  ) expected(table_id,constraint_name,definition)
  WHERE NOT EXISTS (SELECT FROM pg_constraint c WHERE c.conrelid=expected.table_id
   AND c.conname=expected.constraint_name AND c.convalidated AND pg_get_constraintdef(c.oid)=expected.definition)
 ) OR EXISTS (
  SELECT FROM (VALUES
   ('ppw_backstage_open_promises',$definition$CREATE INDEX ppw_backstage_open_promises ON public.ppw_backstage_requests USING btree (world_id, promotion_id, due_week_index, request_id) WHERE (status = 'PROMISED'::text)$definition$),
   ('ppw_backstage_promise_history',$definition$CREATE INDEX ppw_backstage_promise_history ON public.ppw_backstage_requests USING btree (world_id, promotion_id, responded_week_index DESC, request_id DESC) WHERE ((decision = ANY (ARRAY['PROMISE_APPEARANCE'::text, 'PROMISE_SEGMENT'::text, 'PROMISE_FEATURED'::text, 'PROMISE_TITLE_MATCH'::text, 'EXPLORE_RENEWAL'::text])) AND (responded_week_index IS NOT NULL))$definition$)
  ) expected(index_name,definition)
  WHERE NOT EXISTS (SELECT FROM pg_index i WHERE i.indexrelid=to_regclass('public.'||expected.index_name)
   AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=expected.definition)
 ) THEN RAISE EXCEPTION '0170 catalogue verification failed'; END IF;
END $migration$;

COMMIT;
