-- Widen verified winner identities to 30 independent entries and 6 tag teams.
-- Canonical booking and receipt validation retain strict scoped bounds.
ALTER TABLE ppw_completed_show_matches
 DROP CONSTRAINT ppw_completed_show_matches_actual_winner_side_check;
ALTER TABLE ppw_completed_show_matches
 ADD CONSTRAINT ppw_completed_show_matches_actual_winner_side_check
 CHECK(actual_winner_side ~ '^([A-Z]|A[A-D])$');
ALTER TABLE ppw_individual_field_career_effects
 DROP CONSTRAINT ppw_individual_field_career_effects_actual_winner_side_check;
ALTER TABLE ppw_individual_field_career_effects
 ADD CONSTRAINT ppw_individual_field_career_effects_actual_winner_side_check
 CHECK(actual_winner_side ~ '^([A-Z]|A[A-D])$');
ALTER TABLE ppw_individual_field_career_effects
 DROP CONSTRAINT ppw_individual_field_career_effects_performer_side_check;
ALTER TABLE ppw_individual_field_career_effects
 ADD CONSTRAINT ppw_individual_field_career_effects_performer_side_check
 CHECK(performer_side ~ '^([A-Z]|A[A-D])$');
ALTER TABLE ppw_tag_match_career_effects
 DROP CONSTRAINT ppw_tag_match_career_effects_actual_winner_side_check;
ALTER TABLE ppw_tag_match_career_effects
 ADD CONSTRAINT ppw_tag_match_career_effects_actual_winner_side_check
 CHECK(actual_winner_side IN ('A','B','C','D','E','F'));
ALTER TABLE ppw_tag_match_career_effects
 DROP CONSTRAINT ppw_tag_match_career_effects_performer_side_check;
ALTER TABLE ppw_tag_match_career_effects
 ADD CONSTRAINT ppw_tag_match_career_effects_performer_side_check
 CHECK(performer_side IN ('A','B','C','D','E','F'));
