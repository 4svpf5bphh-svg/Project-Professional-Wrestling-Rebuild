-- Preserve existing 4-person tournament draw and history while allowing an
-- 8-person draw: bouts 1-4 quarterfinals, 5-6 semifinals, 7 final.
ALTER TABLE ppw_tournaments ADD COLUMN entrants_count smallint NOT NULL
 DEFAULT 4 CHECK (entrants_count IN (4,8));
ALTER TABLE ppw_tournament_bouts
 DROP CONSTRAINT ppw_tournament_bouts_bout_no_check,
 ADD CONSTRAINT ppw_tournament_bouts_bout_no_check CHECK(bout_no BETWEEN 1 AND 7);
