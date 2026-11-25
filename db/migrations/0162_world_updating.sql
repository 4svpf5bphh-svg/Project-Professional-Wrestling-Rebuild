ALTER TABLE ppw_worlds DROP CONSTRAINT IF EXISTS ppw_worlds_phase_check;
ALTER TABLE ppw_worlds ADD CONSTRAINT ppw_worlds_phase_check CHECK (phase IN ('OPEN','LOCKED','RESOLVING','UPDATING'));
CREATE TABLE IF NOT EXISTS ppw_world_update_runs (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 year integer NOT NULL, week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 state text NOT NULL CHECK(state IN ('ACTIVE','COMPLETE')),
 public_state text NOT NULL CHECK(public_state IN ('WAITING','PROCESSING','READY','FALLBACK')),
 public_claim_token text, public_claim_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 PRIMARY KEY(world_id,year,week)
);
CREATE UNIQUE INDEX IF NOT EXISTS ppw_one_active_world_update ON ppw_world_update_runs(world_id) WHERE state='ACTIVE';
CREATE TABLE IF NOT EXISTS ppw_world_update_jobs (
 world_id text NOT NULL, year integer NOT NULL, week integer NOT NULL,
 show_id text NOT NULL, promotion_id text NOT NULL, player_id text NOT NULL,
 show_day integer NOT NULL,
 state text NOT NULL CHECK(state IN ('WAITING','PROCESSING','READY','FALLBACK')),
 claim_token text, claim_until timestamptz,
 PRIMARY KEY(world_id,year,week,show_id),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_world_update_runs(world_id,year,week) ON DELETE CASCADE
);

-- Adjacent exclusive terms are legal; overlapping signed exclusive terms are not.
-- The former global uniqueness check also rejected a legal next-week signing.
CREATE EXTENSION IF NOT EXISTS btree_gist;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='ppw_contracts'::regclass
  AND conname='ppw_exclusive_contract_windows_do_not_overlap') THEN
  ALTER TABLE ppw_contracts ADD CONSTRAINT ppw_exclusive_contract_windows_do_not_overlap
   EXCLUDE USING gist (world_id WITH =,person_id WITH =,
    int4range(start_week_index,expires_week_index,'[]') WITH &&)
   WHERE (family='EXCLUSIVE' AND status='SIGNED');
 END IF;
END $$;
DROP INDEX IF EXISTS ppw_one_signed_exclusive_contract_per_person;
CREATE INDEX IF NOT EXISTS ppw_accepted_renewal_person ON ppw_contract_renewal_proposals(world_id,person_id)
 WHERE status='ACCEPTED';
-- A signed next term reserves service capacity now, but never replaces the
-- real contract row until the certified rollover. No rival financial terms.
CREATE OR REPLACE VIEW ppw_signed_service_windows AS
 SELECT c.world_id,c.person_id,c.promotion_id,c.contract_id,c.family,c.status,
  c.remaining_dates,c.start_week_index,c.expires_week_index,false AS is_renewal
 FROM ppw_contracts c WHERE c.status='SIGNED'
 UNION ALL
 SELECT r.world_id,r.person_id,r.promotion_id,'renewal:'||r.proposal_id,
  r.proposed_terms->>'family','SIGNED'::text,
  CASE WHEN r.proposed_terms->>'family'='EXCLUSIVE' THEN NULL ELSE (r.proposed_terms->>'dateEntitlement')::integer END,
  c.expires_week_index+1,c.expires_week_index+(r.proposed_terms->>'termWeeks')::integer,true
 FROM ppw_contract_renewal_proposals r JOIN ppw_contracts c ON c.world_id=r.world_id AND c.contract_id=r.contract_id
 WHERE r.status='ACCEPTED' AND c.status='SIGNED'
  AND r.proposed_terms->>'family' IN ('EXCLUSIVE','LIMITED_NON_EXCLUSIVE')
  AND (r.proposed_terms->>'termWeeks')::integer BETWEEN 1 AND 52
  AND (r.proposed_terms->>'dateEntitlement')::integer BETWEEN 1 AND 104;
