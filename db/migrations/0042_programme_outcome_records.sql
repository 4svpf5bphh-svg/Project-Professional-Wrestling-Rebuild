-- Original rivalry win/draw statistics recorded only from actual completed matches.
ALTER TABLE ppw_programme_resolved_activities
 ADD COLUMN winner_side text CHECK(winner_side IN ('A','B'));
ALTER TABLE ppw_programmes
 ADD COLUMN activity_count integer NOT NULL DEFAULT 0 CHECK(activity_count>=0),
 ADD COLUMN match_count integer NOT NULL DEFAULT 0 CHECK(match_count>=0),
 ADD COLUMN segment_count integer NOT NULL DEFAULT 0 CHECK(segment_count>=0),
 ADD COLUMN side_a_wins integer NOT NULL DEFAULT 0 CHECK(side_a_wins>=0),
 ADD COLUMN side_b_wins integer NOT NULL DEFAULT 0 CHECK(side_b_wins>=0),
 ADD COLUMN draws integer NOT NULL DEFAULT 0 CHECK(draws>=0);
