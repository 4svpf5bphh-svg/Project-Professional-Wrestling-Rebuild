-- Phase 7: durable public heritage, settled only inside the existing certified
-- World-week transaction. No extra cron, player votes, purchases or unlocks.
CREATE TABLE ppw_world_year_honours (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 year integer NOT NULL CHECK(year>0),
 category text NOT NULL CHECK(category IN
  ('MATCH','ANGLE','WRESTLER_MEN','WRESTLER_WOMEN','PROMOTION')),
 subject_id text NOT NULL CHECK(length(subject_id)>0),
 subject_name text NOT NULL CHECK(length(subject_name) BETWEEN 1 AND 300),
 promotion_id text,
 promotion_name text,
 citation text NOT NULL CHECK(length(citation) BETWEEN 1 AND 400),
 source_week integer CHECK(source_week BETWEEN 1 AND 52),
 PRIMARY KEY(world_id,year,category)
);
CREATE INDEX ppw_world_year_honours_recent
 ON ppw_world_year_honours(world_id,year DESC,category);

-- Hall membership is world-wide, historical and immutable. An induction is
-- not a playable legend unlock, monetary reward or combat modifier.
CREATE TABLE ppw_world_hall_of_fame (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 person_id text NOT NULL,
 wrestler_name text NOT NULL CHECK(length(wrestler_name) BETWEEN 1 AND 300),
 division text NOT NULL CHECK(division IN ('MEN','WOMEN')),
 inducted_year integer NOT NULL CHECK(inducted_year>0),
 career_matches integer NOT NULL CHECK(career_matches>=0),
 career_wins integer NOT NULL CHECK(career_wins>=0),
 best_stars numeric(4,2) NOT NULL CHECK(best_stars BETWEEN 0 AND 5),
 PRIMARY KEY(world_id,person_id)
);
CREATE INDEX ppw_world_hof_classes
 ON ppw_world_hall_of_fame(world_id,inducted_year DESC,person_id);

CREATE TABLE ppw_world_moments (
 world_id text NOT NULL,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 moment_key text NOT NULL CHECK(length(moment_key) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('CLASSIC','TITLE','TURN','EVENT')),
 headline text NOT NULL CHECK(length(headline) BETWEEN 1 AND 240),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 500),
 promotion_name text NOT NULL,
 show_id text NOT NULL,
 PRIMARY KEY(world_id,year,week,moment_key),
 FOREIGN KEY(world_id,year,week)
  REFERENCES ppw_world_news_weeks(world_id,year,week) ON DELETE CASCADE
);
CREATE INDEX ppw_world_moments_recent
 ON ppw_world_moments(world_id,year DESC,week DESC,moment_key);
