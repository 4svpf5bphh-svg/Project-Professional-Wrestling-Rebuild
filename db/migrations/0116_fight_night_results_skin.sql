-- Extend the existing owner-scoped selection to the approved Fight Night skin.
-- No new state, poller, game result field or World-scope write.
ALTER TABLE ppw_kp_results_skins DROP CONSTRAINT ppw_kp_results_skins_style_check;
ALTER TABLE ppw_kp_results_skins ADD CONSTRAINT ppw_kp_results_skins_style_check
 CHECK(style IN ('TERRITORY_TV','FIGHT_NIGHT'));
