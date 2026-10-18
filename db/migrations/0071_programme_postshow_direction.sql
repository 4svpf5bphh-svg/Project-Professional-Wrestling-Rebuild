-- An authored next-story direction after a verified completed rivalry match.
-- No automated bout, feud heat, segment, result or booking is generated.
CREATE TABLE ppw_programme_postshow_directions (
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 programme_id text NOT NULL,
 show_id text NOT NULL,
 slot_id text NOT NULL,
 chosen_week_index integer NOT NULL CHECK (chosen_week_index >= 0),
 choice text NOT NULL CHECK (choice IN ('PURSUE_REMATCH','PLAN_RETALIATION','LET_STAND')),
 chosen_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY (world_id,promotion_id,programme_id,show_id,slot_id),
 FOREIGN KEY (world_id,promotion_id,programme_id,show_id,slot_id)
  REFERENCES ppw_programme_resolved_activities
  (world_id,promotion_id,programme_id,show_id,slot_id)
);
CREATE INDEX ppw_programme_latest_direction
 ON ppw_programme_postshow_directions
 (world_id,promotion_id,programme_id,chosen_week_index DESC,chosen_at DESC);
