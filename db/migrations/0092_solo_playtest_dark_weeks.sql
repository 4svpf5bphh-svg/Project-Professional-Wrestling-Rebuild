-- One explicitly approved human dark week, scoped to the solo operator and one
-- World Lock. The promotion keeps its contracts/finances; no fictitious show,
-- wrestlers, venue or match result is created. AI promotions continue normally.
CREATE TABLE ppw_playtest_dark_weeks (
 world_id text NOT NULL,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 promotion_id text NOT NULL,
 operator_player_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,year,week,promotion_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,operator_player_id) REFERENCES ppw_memberships(world_id,player_id)
);
