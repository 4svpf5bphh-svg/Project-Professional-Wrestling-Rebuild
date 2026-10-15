-- Per-promotion opt-in, NEVER inferred from an unclaimed promotion.
-- The authenticated active controlling player alone may change this before
-- the single World Lock. The owner ID is kept so stale delegation cannot
-- transfer with a promotion to another player.
CREATE TABLE ppw_staff_continuity_settings (
 world_id text NOT NULL, promotion_id text NOT NULL,
 owner_player_id text NOT NULL,
 allow_unfinished_fallback boolean NOT NULL DEFAULT false,
 PRIMARY KEY(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,owner_player_id) REFERENCES ppw_memberships(world_id,player_id)
);
-- Durable, bounded snapshot for the one weekly Lock. A snapshot records
-- readiness and permission, not a generated show or penalty.
CREATE TABLE ppw_week_continuity_assessments (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 promotion_id text NOT NULL,
 status text NOT NULL CHECK(status IN (
   'SUBMITTED_READY','SUBMITTED_REVIEW','PREPARED_DRAFT',
   'STAFF_FALLBACK_ELIGIBLE','PLAYER_ACTION_REQUIRED','AI_MANAGED','UNASSIGNED')),
 show_id text,
 controller_player_id text,
 PRIMARY KEY(world_id,year,week,promotion_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
