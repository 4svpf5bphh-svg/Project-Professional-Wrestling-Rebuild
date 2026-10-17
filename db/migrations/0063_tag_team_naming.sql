-- Preserve shared tag-team identities while preventing other promotions
-- overwriting a human-managed team name. Historic automatically recognised
-- teams have no naming owner and can be named by an eligible roster controller.
ALTER TABLE ppw_tag_teams
 ADD COLUMN naming_promotion_id text,
 ADD COLUMN formed_week_index integer CHECK(formed_week_index >= 0);
CREATE INDEX ppw_tag_teams_naming_controller
 ON ppw_tag_teams(world_id,naming_promotion_id,team_id)
 WHERE naming_promotion_id IS NOT NULL;
