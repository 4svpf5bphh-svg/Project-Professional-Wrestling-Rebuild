-- Optional account presentation identity, independent of signed invite credentials.
-- Player IDs remain opaque server-side. Profile names can be set before World join.
CREATE TABLE ppw_player_profiles (
 player_id text PRIMARY KEY REFERENCES ppw_players(player_id),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 3 AND 48),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Stable immutable promotion IDs remain authoritative after cosmetic rebranding.
-- Existing certified results keep their original, already published text.
CREATE TABLE ppw_promotion_name_history (
 name_change_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 previous_name text NOT NULL,
 new_name text NOT NULL,
 year integer NOT NULL CHECK(year>=1),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 changed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_promotion_name_history_by_promotion
 ON ppw_promotion_name_history(world_id,promotion_id,changed_at DESC);
