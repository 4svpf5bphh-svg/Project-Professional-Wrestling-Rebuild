-- Required original AI profile for intent/finish selection, no guessed
-- server defaults on original Genesis Worlds. Staff plans remain separate.
ALTER TABLE ppw_promotions
 ADD COLUMN ai_risk_tolerance double precision
  CHECK(ai_risk_tolerance IS NULL OR ai_risk_tolerance BETWEEN 0 AND 100),
 ADD COLUMN ai_match_quality_preference double precision
  CHECK(ai_match_quality_preference IS NULL OR ai_match_quality_preference BETWEEN 0 AND 100),
 ADD COLUMN ai_star_preference double precision
  CHECK(ai_star_preference IS NULL OR ai_star_preference BETWEEN 0 AND 100);
