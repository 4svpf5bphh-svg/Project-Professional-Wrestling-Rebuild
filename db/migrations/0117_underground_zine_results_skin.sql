-- No new Neon read or game-state mutation: third approved account-owned result style.
-- Execute after 0115 and 0116, preserving the original and existing paid selections.
ALTER TABLE ppw_kp_results_skins DROP CONSTRAINT ppw_kp_results_skins_style_check;
ALTER TABLE ppw_kp_results_skins ADD CONSTRAINT ppw_kp_results_skins_style_check
 CHECK(style IN ('TERRITORY_TV','FIGHT_NIGHT','UNDERGROUND_ZINE'));
