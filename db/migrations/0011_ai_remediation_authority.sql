-- Explicit assignment prevents an unclaimed dormant promotion from being
-- mistaken for a simulation-controlled company after World Lock.
ALTER TABLE ppw_promotions ADD COLUMN management_mode text NOT NULL DEFAULT 'UNASSIGNED'
  CHECK (management_mode IN ('UNASSIGNED','AI','HUMAN'));
-- Human control always overrides even an incorrectly retained AI flag.
-- Changes in authority must be made by trusted membership/world setup flows.
