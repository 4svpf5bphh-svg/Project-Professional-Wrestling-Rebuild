-- Eight-week World-wide rivalry review: one compact row per promotion.
-- No schedule, polling, paid AI or wrestler/roster data. All figures arise
-- from past certified shows and public company standing, never private cards.
CREATE TABLE ppw_promotion_competition(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 rival_promotion_id text,
 target_promotion_id text,
 rival_since_week_index integer NOT NULL CHECK(rival_since_week_index>=0),
 reviewed_week_index integer NOT NULL CHECK(reviewed_week_index>=0),
 own_show_count integer NOT NULL DEFAULT 0 CHECK(own_show_count>=0),
 rival_show_count integer NOT NULL DEFAULT 0 CHECK(rival_show_count>=0),
 own_avg_crowd numeric(5,1),
 rival_avg_crowd numeric(5,1),
 own_reach numeric(5,1),
 rival_reach numeric(5,1),
 own_tv_rating numeric(5,2),
 rival_tv_rating numeric(5,2),
 PRIMARY KEY(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id)
  REFERENCES ppw_promotions(world_id,promotion_id) ON DELETE CASCADE,
 CHECK(rival_promotion_id IS NULL OR rival_promotion_id<>promotion_id),
 CHECK(target_promotion_id IS NULL OR target_promotion_id<>promotion_id)
);
-- Rival IDs are projected only through an ACTIVE public promotion JOIN;
-- a promotion that enters dormancy disappears on the next review.
