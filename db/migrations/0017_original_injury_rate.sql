-- Original PPW ruleset injury-rate multiplier for replay parity.
-- Null means old ruleset configuration has NOT been imported; do not guess 1.
ALTER TABLE ppw_worlds ADD COLUMN injury_rate_multiplier numeric(6,3)
 CHECK(injury_rate_multiplier BETWEEN 0 AND 10);
