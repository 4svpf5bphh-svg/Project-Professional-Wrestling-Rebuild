-- Gorilla Position is pre-authorised by the player before the ONE World Lock.
-- The immutable log is written ONLY by canonical World show resolution.
CREATE TABLE ppw_gorilla_policies(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 owner_player_id text NOT NULL,
 policy text NOT NULL DEFAULT 'STICK_TO_CARD'
  CHECK(policy IN ('STICK_TO_CARD','USE_JUDGEMENT','FOLLOW_THE_CROWD','PROTECT_KEY_PLANS')),
 updated_week_index integer NOT NULL DEFAULT 0 CHECK(updated_week_index>=0),
 PRIMARY KEY(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE,
 FOREIGN KEY(world_id,owner_player_id) REFERENCES ppw_memberships(world_id,player_id)
);
CREATE TABLE ppw_gorilla_show_logs(
 world_id text NOT NULL,
 show_id text NOT NULL,
 promotion_id text NOT NULL,
 policy text NOT NULL CHECK(policy IN
  ('STICK_TO_CARD','USE_JUDGEMENT','FOLLOW_THE_CROWD','PROTECT_KEY_PLANS')),
 staff_id text,
 staff_name text NOT NULL,
 log_json jsonb NOT NULL CHECK(jsonb_typeof(log_json)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,show_id),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id) ON DELETE CASCADE,
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE
);
