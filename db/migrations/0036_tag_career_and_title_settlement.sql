-- Team championships share the same authoritative contest ledger; a
-- recorded winner is either one person or one real World team, never both.
ALTER TABLE ppw_championship_contests ALTER COLUMN winner_person_id DROP NOT NULL;
ALTER TABLE ppw_championship_contests
 ADD COLUMN winner_team_id text,
 ADD CONSTRAINT ppw_title_contest_winning_team
  FOREIGN KEY(world_id,winner_team_id) REFERENCES ppw_tag_teams(world_id,team_id),
 ADD CONSTRAINT ppw_title_contest_one_winner CHECK (
   (winner_person_id IS NOT NULL AND winner_team_id IS NULL) OR
   (winner_person_id IS NULL AND winner_team_id IS NOT NULL)
 );
CREATE TABLE ppw_tag_match_career_effects (
 world_id text NOT NULL,
 show_id text NOT NULL,
 match_id text NOT NULL,
 person_id text NOT NULL,
 actual_winner_side text NOT NULL CHECK(actual_winner_side IN ('A','B')),
 performer_side text NOT NULL CHECK(performer_side IN ('A','B')),
 won boolean NOT NULL,
 before_stats jsonb NOT NULL,
 after_stats jsonb NOT NULL,
 injury_severity text CHECK(injury_severity IN ('MINOR','MODERATE','MAJOR','SEVERE')),
 injury_weeks_out integer CHECK(injury_weeks_out BETWEEN 1 AND 52),
 PRIMARY KEY(world_id,show_id,match_id,person_id),
 FOREIGN KEY(world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 CHECK((injury_severity IS NULL)=(injury_weeks_out IS NULL))
);
CREATE INDEX ppw_tag_career_person_history
 ON ppw_tag_match_career_effects(world_id,person_id,show_id);
