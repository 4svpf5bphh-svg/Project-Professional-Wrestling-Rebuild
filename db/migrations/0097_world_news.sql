-- Public editorial snapshots are produced once, atomically, by the certified World rollover.
-- Not player writable; nothing in here represents private negotiations or future cards.
CREATE TABLE ppw_world_news_weeks(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 PRIMARY KEY(world_id,year,week)
);
CREATE TABLE ppw_world_news_awards(
 world_id text NOT NULL, year integer NOT NULL, week integer NOT NULL,
 kind text NOT NULL CHECK(kind IN ('MATCH','ANGLE')),
 promotion_id text NOT NULL, promotion_name text NOT NULL,
 show_id text NOT NULL, show_name text NOT NULL,
 slot_id text NOT NULL, title text NOT NULL,
 people_names text[] NOT NULL DEFAULT '{}',
 person_ids text[] NOT NULL DEFAULT '{}',
 rating numeric(5,2) NOT NULL CHECK(rating BETWEEN 0 AND 100),
 rating_unit text NOT NULL CHECK(rating_unit IN ('STARS','CROWD')),
 PRIMARY KEY(world_id,year,week,kind),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_world_news_weeks(world_id,year,week),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id) ON DELETE CASCADE
);
CREATE TABLE ppw_world_news_items(
 world_id text NOT NULL,year integer NOT NULL,week integer NOT NULL,
 story_key text NOT NULL,
 desk text NOT NULL CHECK(desk IN ('OFFICIAL','DIRT')),
 certainty text NOT NULL CHECK(certainty IN ('CONFIRMED','SPECULATION')),
 promotion_id text NOT NULL,promotion_name text NOT NULL,
 show_id text NOT NULL,title text NOT NULL,summary text NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN ('MATCH','ANGLE','TITLE','EVENT','CROWD')),
 PRIMARY KEY(world_id,year,week,story_key),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_world_news_weeks(world_id,year,week),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id) ON DELETE CASCADE,
 CHECK(length(story_key) BETWEEN 1 AND 200),
 CHECK(length(title) BETWEEN 1 AND 240),
 CHECK(length(summary)<=600),
 CHECK((desk='OFFICIAL' AND certainty='CONFIRMED') OR
       (desk='DIRT' AND certainty='SPECULATION'))
);
CREATE INDEX ppw_news_items_recent ON ppw_world_news_items(world_id,year DESC,week DESC,desk,story_key);
