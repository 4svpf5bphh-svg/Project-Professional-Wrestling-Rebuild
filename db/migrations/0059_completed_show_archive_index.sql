-- Indexed private archive, without fetching whole World state.
CREATE INDEX ppw_completed_shows_promotion_archive
 ON ppw_completed_shows(world_id,promotion_id,year DESC,week DESC,show_id DESC);
