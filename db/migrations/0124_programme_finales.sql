-- Optional, owner-authored on-screen ending for a promotion programme.
-- Planning never closes the programme. The linked certified show is the
-- only authority allowed to mark a finale delivered and close the feud.
CREATE TABLE ppw_programme_finales (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 programme_id text NOT NULL,
 show_id text NOT NULL CHECK (length(show_id) BETWEEN 1 AND 200),
 slot_id text NOT NULL CHECK (length(slot_id) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK (kind IN ('MATCH','SEGMENT')),
 payoff text NOT NULL CHECK (payoff IN
  ('DECISIVE_MATCH','TITLE_SHOWDOWN','STIPULATION_SHOWDOWN',
   'BETRAYAL','RECONCILIATION','FINAL_CONFRONTATION')),
 planned_week_index integer NOT NULL CHECK (planned_week_index>=0),
 resolved_week_index integer CHECK (resolved_week_index>=planned_week_index),
 resolved_crowd_response double precision CHECK (
  resolved_crowd_response BETWEEN 0 AND 100),
 resolved_winner_side text CHECK (resolved_winner_side IN ('A','B')),
 planned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (world_id,promotion_id,programme_id),
 FOREIGN KEY (world_id,promotion_id,programme_id)
  REFERENCES ppw_programmes(world_id,promotion_id,programme_id),
 CHECK ((kind='MATCH' AND payoff IN
   ('DECISIVE_MATCH','TITLE_SHOWDOWN','STIPULATION_SHOWDOWN'))
  OR (kind='SEGMENT' AND payoff IN
   ('BETRAYAL','RECONCILIATION','FINAL_CONFRONTATION')))
);
-- One World/promotion show lookup in the existing programme settlement
-- read; inactive or unlinked plans never alter the match result.
CREATE INDEX ppw_programme_finales_by_show
 ON ppw_programme_finales(world_id,promotion_id,show_id)
 WHERE resolved_week_index IS NULL;
