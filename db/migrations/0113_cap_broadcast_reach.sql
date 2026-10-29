-- Long-run broadcast contract correction. Media reach is a bounded 0–100
-- audience index in original show-demand, competition and annual standing.
-- Earlier offers could stack a percentage on a reach of 90, making 105
-- and blocking all World progression after Year 1.
-- Do not change contract durations, weekly income, identity, earnings,
-- programme outcomes, World Lock or previously certified receipts.
BEGIN;
UPDATE ppw_commercial_deals
SET baseline_reach=CASE WHEN baseline_reach>100 THEN 100 ELSE baseline_reach END,
    agreed_reach=CASE WHEN agreed_reach>100 THEN 100 ELSE agreed_reach END
WHERE baseline_reach>100 OR agreed_reach>100;
UPDATE ppw_promotions SET media_reach=100 WHERE media_reach>100;
COMMIT;
