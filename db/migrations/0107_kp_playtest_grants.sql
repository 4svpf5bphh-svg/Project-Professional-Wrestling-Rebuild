-- One-time, operator-authorised cosmetic testing credit. No game economy or World outcome changes.
-- Scoped to the real signed-in admin player, not to arbitrary browser-supplied player IDs.
CREATE TABLE ppw_kp_playtest_grants(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 previous_balance bigint NOT NULL CHECK(previous_balance>=0),
 amount bigint NOT NULL CHECK(amount BETWEEN 0 AND 50000),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,player_id)
);
