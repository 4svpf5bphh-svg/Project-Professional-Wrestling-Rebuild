BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '60s';

-- Apply during a paused booking/advancement window. These locks prevent a
-- World starting resolution after the check and before the index replacement.
LOCK TABLE public.ppw_worlds, public.ppw_world_update_runs,
 public.ppw_weekly_world_editorial, public.ppw_ledger_events IN SHARE ROW EXCLUSIVE MODE;

DO $guard$
BEGIN
 IF EXISTS (SELECT FROM public.ppw_worlds WHERE phase <> 'OPEN')
 OR EXISTS (SELECT FROM public.ppw_world_update_runs WHERE state='ACTIVE')
 OR EXISTS (SELECT FROM public.ppw_weekly_world_editorial WHERE state='PENDING')
 THEN RAISE EXCEPTION '0168 requires idle Worlds and no pending editorial'; END IF;
END $guard$;

CREATE INDEX IF NOT EXISTS ppw_ledger_week_operating_finance
 ON public.ppw_ledger_events(world_id,year,week,event_type)
 WHERE event_type IN ('CONTRACT_SIGNED','CONTRACT_EXTRA_DATES_ACCEPTED',
  'CONTRACT_APPEARANCE_FEES','CONTRACT_GUARANTEE_PAID',
  'CONTRACT_TERMINATED_DURING_RESTRUCTURING','PROMOTION_RECURRING_FINANCES',
  'SHOW_EVENT_ECONOMICS','STAFF_BUYOUT','COMMERCIAL_PERFORMANCE_BONUS');

DO $verify$
DECLARE predicate text;
BEGIN
 SELECT pg_get_expr(indpred,indrelid) INTO predicate FROM pg_index
 WHERE indexrelid='public.ppw_ledger_week_operating_finance'::regclass
  AND indrelid='public.ppw_ledger_events'::regclass AND indisready AND indisvalid
  AND pg_get_indexdef(indexrelid) LIKE '%USING btree (world_id, year, week, event_type)%';
 IF predicate IS DISTINCT FROM
  '(event_type = ANY (ARRAY[''CONTRACT_SIGNED''::text, ''CONTRACT_EXTRA_DATES_ACCEPTED''::text, ''CONTRACT_APPEARANCE_FEES''::text, ''CONTRACT_GUARANTEE_PAID''::text, ''CONTRACT_TERMINATED_DURING_RESTRUCTURING''::text, ''PROMOTION_RECURRING_FINANCES''::text, ''SHOW_EVENT_ECONOMICS''::text, ''STAFF_BUYOUT''::text, ''COMMERCIAL_PERFORMANCE_BONUS''::text]))'
 THEN RAISE EXCEPTION '0168 catalogue verification failed'; END IF;
END $verify$;

-- A certified week may contain only scheduled dark promotions.
DO $verify$
DECLARE previous text;
BEGIN
 SELECT pg_get_expr(conbin,conrelid) INTO previous FROM pg_constraint
 WHERE conrelid='public.ppw_week_resource_clearances'::regclass
  AND conname='ppw_week_resource_clearances_inspected_slots_check'
  AND contype='c' AND convalidated;
 IF previous = '(inspected_slots > 0)' THEN
  ALTER TABLE public.ppw_week_resource_clearances
   DROP CONSTRAINT ppw_week_resource_clearances_inspected_slots_check,
   ADD CONSTRAINT ppw_week_resource_clearances_inspected_slots_check CHECK (inspected_slots >= 0);
 ELSIF previous IS DISTINCT FROM '(inspected_slots >= 0)' THEN
  RAISE EXCEPTION '0168 unexpected resource clearance catalogue';
 END IF;
 IF NOT EXISTS (SELECT FROM pg_constraint
  WHERE conrelid='public.ppw_week_resource_clearances'::regclass
   AND conname='ppw_week_resource_clearances_inspected_slots_check' AND convalidated
   AND pg_get_expr(conbin,conrelid)='(inspected_slots >= 0)')
 THEN RAISE EXCEPTION '0168 resource clearance catalogue verification failed'; END IF;
END $verify$;

DROP INDEX IF EXISTS public.ppw_ledger_week_finance;
COMMIT;
