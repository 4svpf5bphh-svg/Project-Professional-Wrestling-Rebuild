-- Dismissible promoter news only. Mandatory booking tasks cannot be hidden.
-- One small idempotent row per person/offer; independent of World revision.
CREATE TABLE ppw_player_attention_dismissals (
 world_id text NOT NULL,
 player_id text NOT NULL,
 promotion_id text NOT NULL,
 attention_id text NOT NULL CHECK (length(attention_id) BETWEEN 14 AND 230),
 dismissed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(world_id,player_id,promotion_id,attention_id),
 FOREIGN KEY(world_id,player_id) REFERENCES ppw_memberships(world_id,player_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
