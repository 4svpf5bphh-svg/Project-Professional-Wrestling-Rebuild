-- Account-owned Staff Office appearances: no simulation, promotion or staff changes.
-- All themes are CSS-only and staff Office reads remain bounded.
CREATE TABLE ppw_kp_staff_office_themes (
 player_id text PRIMARY KEY REFERENCES ppw_players(player_id) ON DELETE CASCADE,
 style text NOT NULL CHECK(style IN ('GORILLA_CONTROL','TERRITORY_ROOM','EXECUTIVE_SUITE','EWR_OFFICE_2002','UNDERGROUND_OFFICE','CREATIVE_STUDIO','BROADCAST_NEWSROOM','NEON_CONTROL','STEELWORKS_OFFICE'))
);
ALTER TABLE ppw_kp_receipts DROP CONSTRAINT ppw_kp_receipts_kind_check;
ALTER TABLE ppw_kp_receipts ADD CONSTRAINT ppw_kp_receipts_kind_check
 CHECK(kind IN ('BUY','APPLY_BRAND','APPLY_BADGE','CLEAR_BADGE',
 'APPLY_RESULTS_SKIN','CLEAR_RESULTS_SKIN','APPLY_EVENT_POSTER','CLEAR_EVENT_POSTER',
 'APPLY_STAFF_OFFICE_THEME','CLEAR_STAFF_OFFICE_THEME',
 'RENAME_STAFF','CREATE_WRESTLER','COLLECT_LEGEND'));
