-- Extend account-owned cosmetic results style: no World mutation or extra reads.
ALTER TABLE ppw_kp_results_skins DROP CONSTRAINT ppw_kp_results_skins_style_check;
ALTER TABLE ppw_kp_results_skins ADD CONSTRAINT ppw_kp_results_skins_style_check
 CHECK(style IN ('TERRITORY_TV','FIGHT_NIGHT','UNDERGROUND_ZINE','RETRO_BOOKER_02'));
