-- A protected/DQ tag-title finish may declare a winning pair that has
-- never formed an active World team. Preserve the factual winner in the
-- title-contest ledger without creating a fictional portable team or
-- attributing the match victory to the defending champions.
ALTER TABLE ppw_championship_contests
 ADD COLUMN winning_pair_person_ids text[];
ALTER TABLE ppw_championship_contests
 DROP CONSTRAINT ppw_title_contest_one_winner;
ALTER TABLE ppw_championship_contests
 ADD CONSTRAINT ppw_title_contest_one_winner CHECK (
  (winner_person_id IS NOT NULL AND winner_team_id IS NULL
   AND winning_pair_person_ids IS NULL)
  OR (winner_person_id IS NULL AND winner_team_id IS NOT NULL
   AND winning_pair_person_ids IS NULL)
  OR (winner_person_id IS NULL AND winner_team_id IS NULL
   AND winning_pair_person_ids IS NOT NULL
   AND cardinality(winning_pair_person_ids)=2
   AND winning_pair_person_ids[1] IS NOT NULL
   AND winning_pair_person_ids[2] IS NOT NULL
   AND winning_pair_person_ids[1]<>winning_pair_person_ids[2]
   AND title_changed IS FALSE)
 );
-- Existing ledger rows keep their original winner FK; the new form is
-- allowed only when the belt did not change hands. World match results
-- remain the canonical evidence for finish and winning side.
