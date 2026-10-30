-- Allow an owned showcase frame to return to the standard look. This action
-- is idempotent and never changes the wallet's balance or gameplay state.
ALTER TABLE ppw_kp_receipts DROP CONSTRAINT ppw_kp_receipts_kind_check;
ALTER TABLE ppw_kp_receipts ADD CONSTRAINT ppw_kp_receipts_kind_check
 CHECK(kind IN ('BUY','APPLY_BRAND','APPLY_BADGE','CLEAR_BADGE',
  'RENAME_STAFF','CREATE_WRESTLER','COLLECT_LEGEND'));
