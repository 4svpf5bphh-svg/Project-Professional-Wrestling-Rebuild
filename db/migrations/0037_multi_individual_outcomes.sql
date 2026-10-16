-- Outcome sides are not limited to two in an individual field match.
ALTER TABLE ppw_completed_show_matches
 DROP CONSTRAINT ppw_completed_show_matches_actual_winner_side_check;
ALTER TABLE ppw_completed_show_matches
 ADD CONSTRAINT ppw_completed_show_matches_actual_winner_side_check
 CHECK(actual_winner_side IN ('A','B','C','D'));
CREATE TABLE ppw_individual_field_career_effects (
 world_id text NOT NULL,show_id text NOT NULL,match_id text NOT NULL,
 person_id text NOT NULL,
 actual_winner_side text NOT NULL CHECK(actual_winner_side IN ('A','B','C','D')),
 performer_side text NOT NULL CHECK(performer_side IN ('A','B','C','D')),
 won boolean NOT NULL,
 before_stats jsonb NOT NULL,after_stats jsonb NOT NULL,
 injury_severity text CHECK(injury_severity IN ('MINOR','MODERATE','MAJOR','SEVERE')),
 injury_weeks_out integer CHECK(injury_weeks_out BETWEEN 1 AND 52),
 PRIMARY KEY(world_id,show_id,match_id,person_id),
 FOREIGN KEY(world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 CHECK((injury_severity IS NULL)=(injury_weeks_out IS NULL))
);
CREATE INDEX ppw_individual_field_career_person
 ON ppw_individual_field_career_effects(world_id,person_id,show_id);
