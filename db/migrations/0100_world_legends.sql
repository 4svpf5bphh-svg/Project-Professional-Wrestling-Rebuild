-- Immutable once-per-World legend arrivals, driven only by the certified weekly rollover.
-- This feature has no scheduler, pack RNG, contract grant or game-play advantage.
CREATE TABLE ppw_legend_processed_weeks(
 world_id text NOT NULL, year integer NOT NULL, week integer NOT NULL,
 PRIMARY KEY(world_id,year,week),
 FOREIGN KEY(world_id,year,week)
  REFERENCES ppw_world_news_weeks(world_id,year,week) ON DELETE CASCADE
);
CREATE TABLE ppw_legend_metrics(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 metric text NOT NULL CHECK(length(metric) BETWEEN 2 AND 64),
 value integer NOT NULL DEFAULT 0 CHECK(value BETWEEN 0 AND 2147483647),
 PRIMARY KEY(world_id,metric)
);
CREATE TABLE ppw_world_legend_unlocks(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 legend_id text NOT NULL CHECK(length(legend_id) BETWEEN 2 AND 100),
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 metric text NOT NULL,
 evidence_value integer NOT NULL CHECK(evidence_value>=0),
 person_ids text[] NOT NULL CHECK(cardinality(person_ids) BETWEEN 1 AND 4),
 ai_eligible_from_week_index integer NOT NULL CHECK(ai_eligible_from_week_index>=0),
 PRIMARY KEY(world_id,legend_id),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_legend_processed_weeks(world_id,year,week)
);
CREATE UNIQUE INDEX ppw_world_legend_person_unique
 ON ppw_world_legend_unlocks(world_id,legend_id);
CREATE TABLE ppw_legend_reveals_seen(
 world_id text NOT NULL, legend_id text NOT NULL,
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,legend_id,player_id),
 FOREIGN KEY(world_id,legend_id)
  REFERENCES ppw_world_legend_unlocks(world_id,legend_id) ON DELETE CASCADE
);
CREATE TABLE ppw_kp_legend_cards(
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 legend_id text NOT NULL CHECK(length(legend_id) BETWEEN 2 AND 100),
 first_unlocked_world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 purchased_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(player_id,legend_id),
 FOREIGN KEY(first_unlocked_world_id,legend_id)
  REFERENCES ppw_world_legend_unlocks(world_id,legend_id)
);
ALTER TABLE ppw_kp_receipts DROP CONSTRAINT ppw_kp_receipts_kind_check;
ALTER TABLE ppw_kp_receipts ADD CONSTRAINT ppw_kp_receipts_kind_check
 CHECK(kind IN('BUY','APPLY_BRAND','APPLY_BADGE','RENAME_STAFF',
 'CREATE_WRESTLER','COLLECT_LEGEND'));
