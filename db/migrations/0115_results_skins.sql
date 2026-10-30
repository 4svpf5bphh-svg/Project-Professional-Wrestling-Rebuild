-- Account-owned results skins affect only the owner's results presentation.
-- Selection is not promotion money, a show result, or a World-state mutation.
CREATE TABLE ppw_kp_results_skins (
 player_id text PRIMARY KEY REFERENCES ppw_players(player_id) ON DELETE CASCADE,
 style text NOT NULL CHECK(style IN ('TERRITORY_TV'))
);
-- Extend receipt ledger for free selection/switching, preserving replay protection.
ALTER TABLE ppw_kp_receipts DROP CONSTRAINT ppw_kp_receipts_kind_check;
ALTER TABLE ppw_kp_receipts ADD CONSTRAINT ppw_kp_receipts_kind_check
 CHECK(kind IN ('BUY','APPLY_BRAND','APPLY_BADGE','CLEAR_BADGE',
  'APPLY_RESULTS_SKIN','CLEAR_RESULTS_SKIN',
  'RENAME_STAFF','CREATE_WRESTLER','COLLECT_LEGEND'));
