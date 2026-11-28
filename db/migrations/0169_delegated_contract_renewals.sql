BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;

-- Pause booking and advancement writers before applying. Hold these locks
-- across the idle check and DDL so a World cannot start resolving in between.
LOCK TABLE ppw_worlds, ppw_world_update_runs IN SHARE ROW EXCLUSIVE MODE;

DO $migration$
BEGIN
 IF EXISTS (SELECT FROM ppw_worlds WHERE phase <> 'OPEN')
 OR EXISTS (SELECT FROM ppw_world_update_runs WHERE state='ACTIVE')
 THEN RAISE EXCEPTION '0169 requires idle Worlds'; END IF;

 -- A committed retry verifies the catalogue without replacing existing objects.
 IF to_regclass('public.ppw_delegated_contract_renewals') IS NULL THEN
  CREATE TABLE ppw_delegated_contract_renewals (
   world_id text NOT NULL,
   request_id text NOT NULL,
   promotion_id text NOT NULL,
   owner_player_id text NOT NULL,
   contract_id text NOT NULL,
   source_start_week_index integer NOT NULL,
   created_week_index integer NOT NULL,
   strategy text NOT NULL CHECK(strategy IN ('EXISTING_TERMS','PRIORITY_RETENTION','BALANCED','REDUCE_COSTS')),
   max_weekly_guarantee bigint NOT NULL CHECK(max_weekly_guarantee BETWEEN 0 AND 1000000000),
   max_appearance_fee bigint NOT NULL CHECK(max_appearance_fee BETWEEN 0 AND 1000000000),
   status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SUBMITTED','UNABLE','WITHDRAWN')),
   processed_week_index integer,
   PRIMARY KEY(world_id,request_id),
   FOREIGN KEY(world_id,contract_id) REFERENCES ppw_contracts(world_id,contract_id),
   FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
  );
  CREATE UNIQUE INDEX ppw_one_queued_delegated_renewal
   ON ppw_delegated_contract_renewals(world_id,contract_id) WHERE status='QUEUED';
  CREATE INDEX ppw_delegated_renewal_inbox
   ON ppw_delegated_contract_renewals(world_id,promotion_id,owner_player_id,created_week_index DESC);

  ALTER TABLE ppw_contract_offers ADD COLUMN counter_terms jsonb
   CHECK(counter_terms IS NULL OR jsonb_typeof(counter_terms)='object');
  ALTER TABLE ppw_contract_renewal_proposals ADD COLUMN resolved_week_index integer;
  CREATE INDEX ppw_renewal_result_recent ON ppw_contract_renewal_proposals
   (world_id,promotion_id,coalesce(resolved_week_index,created_week_index) DESC)
   WHERE status IN ('ACCEPTED','ACTIVATED','REJECTED') AND proposal_id NOT LIKE 'accepted:%';
 END IF;
 IF NOT EXISTS (
  SELECT FROM pg_class WHERE oid=to_regclass('public.ppw_delegated_contract_renewals') AND relkind='r'
 ) OR (SELECT array_agg(attname||':'||format_type(atttypid,atttypmod)||':'||attnotnull::text ORDER BY attnum)
  FROM pg_attribute WHERE attrelid='ppw_delegated_contract_renewals'::regclass AND attnum>0 AND NOT attisdropped
 ) IS DISTINCT FROM ARRAY['world_id:text:true','request_id:text:true','promotion_id:text:true',
  'owner_player_id:text:true','contract_id:text:true','source_start_week_index:integer:true',
  'created_week_index:integer:true','strategy:text:true','max_weekly_guarantee:bigint:true',
  'max_appearance_fee:bigint:true','status:text:true','processed_week_index:integer:false']
 OR (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a
  ON a.attrelid=d.adrelid AND a.attnum=d.adnum
  WHERE d.adrelid='ppw_delegated_contract_renewals'::regclass AND a.attname='status'
 ) IS DISTINCT FROM $definition$'QUEUED'::text$definition$
 THEN RAISE EXCEPTION '0169 unexpected delegation table'; END IF;

 IF EXISTS (
  SELECT FROM (VALUES
   ('ppw_contract_offers'::regclass,'counter_terms','jsonb'),
   ('ppw_contract_renewal_proposals'::regclass,'resolved_week_index','integer')
  ) expected(table_id,column_name,type_name)
  WHERE NOT EXISTS (SELECT FROM pg_attribute a WHERE a.attrelid=expected.table_id
   AND a.attname=expected.column_name AND format_type(a.atttypid,a.atttypmod)=expected.type_name
   AND NOT a.attnotnull AND NOT a.attisdropped AND NOT a.atthasdef)
 ) OR EXISTS (
  SELECT FROM (VALUES
   ('ppw_contract_offers'::regclass,'ppw_contract_offers_counter_terms_check',$definition$CHECK (((counter_terms IS NULL) OR (jsonb_typeof(counter_terms) = 'object'::text)))$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_pkey',$definition$PRIMARY KEY (world_id, request_id)$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_world_id_contract_id_fkey',$definition$FOREIGN KEY (world_id, contract_id) REFERENCES ppw_contracts(world_id, contract_id)$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_world_id_promotion_id_fkey',$definition$FOREIGN KEY (world_id, promotion_id) REFERENCES ppw_promotions(world_id, promotion_id)$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_status_check',$definition$CHECK ((status = ANY (ARRAY['QUEUED'::text, 'SUBMITTED'::text, 'UNABLE'::text, 'WITHDRAWN'::text])))$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_strategy_check',$definition$CHECK ((strategy = ANY (ARRAY['EXISTING_TERMS'::text, 'PRIORITY_RETENTION'::text, 'BALANCED'::text, 'REDUCE_COSTS'::text])))$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_max_appearance_fee_check',$definition$CHECK (((max_appearance_fee >= 0) AND (max_appearance_fee <= 1000000000)))$definition$),
   ('ppw_delegated_contract_renewals'::regclass,'ppw_delegated_contract_renewals_max_weekly_guarantee_check',$definition$CHECK (((max_weekly_guarantee >= 0) AND (max_weekly_guarantee <= 1000000000)))$definition$)
  ) expected(table_id,constraint_name,definition)
  WHERE NOT EXISTS (SELECT FROM pg_constraint c WHERE c.conrelid=expected.table_id
   AND c.conname=expected.constraint_name AND c.convalidated AND pg_get_constraintdef(c.oid)=expected.definition)
 ) OR EXISTS (
  SELECT FROM (VALUES
   ('ppw_one_queued_delegated_renewal',$definition$CREATE UNIQUE INDEX ppw_one_queued_delegated_renewal ON public.ppw_delegated_contract_renewals USING btree (world_id, contract_id) WHERE (status = 'QUEUED'::text)$definition$),
   ('ppw_delegated_renewal_inbox',$definition$CREATE INDEX ppw_delegated_renewal_inbox ON public.ppw_delegated_contract_renewals USING btree (world_id, promotion_id, owner_player_id, created_week_index DESC)$definition$),
   ('ppw_renewal_result_recent',$definition$CREATE INDEX ppw_renewal_result_recent ON public.ppw_contract_renewal_proposals USING btree (world_id, promotion_id, COALESCE(resolved_week_index, created_week_index) DESC) WHERE ((status = ANY (ARRAY['ACCEPTED'::text, 'ACTIVATED'::text, 'REJECTED'::text])) AND (proposal_id !~~ 'accepted:%'::text))$definition$)
  ) expected(index_name,definition)
  WHERE NOT EXISTS (SELECT FROM pg_index i WHERE i.indexrelid=to_regclass('public.'||expected.index_name)
   AND i.indisvalid AND i.indisready AND pg_get_indexdef(i.indexrelid)=expected.definition)
 ) THEN RAISE EXCEPTION '0169 catalogue verification failed'; END IF;
END $migration$;

COMMIT;
