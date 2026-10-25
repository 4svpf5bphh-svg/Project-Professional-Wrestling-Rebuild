-- The only on-demand one-shot pilot trigger. Never changes the normal Legend thresholds.
-- Operator arms this for their own currently controlled promotion; consuming requires
-- an actually completed, certified REGULAR show at an existing World rollover.
CREATE TABLE ppw_legend_reveal_pilots(
 world_id text PRIMARY KEY REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 promotion_id text NOT NULL,
 operator_player_id text NOT NULL REFERENCES ppw_players(player_id),
 legend_id text NOT NULL DEFAULT 'undertaker' CHECK(legend_id='undertaker'),
 armed_year integer NOT NULL CHECK(armed_year>0),
 armed_week integer NOT NULL CHECK(armed_week BETWEEN 1 AND 52),
 status text NOT NULL DEFAULT 'ARMED' CHECK(status IN ('ARMED','CONSUMED','CANCELLED')),
 armed_at timestamptz NOT NULL DEFAULT now(),
 consumed_year integer CHECK(consumed_year>0),
 consumed_week integer CHECK(consumed_week BETWEEN 1 AND 52),
 FOREIGN KEY(world_id,promotion_id)
  REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE
);
CREATE INDEX ppw_legend_reveal_pilots_armed ON ppw_legend_reveal_pilots(world_id)
 WHERE status='ARMED';
