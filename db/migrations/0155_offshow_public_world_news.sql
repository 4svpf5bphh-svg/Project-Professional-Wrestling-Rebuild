-- Official employment signings happen at World resolution, not on an
-- invented television card. Keep the completed-show foreign key for every
-- story that actually references a show; an off-show EVENT has no show_id.
ALTER TABLE ppw_world_news_items
 ALTER COLUMN show_id DROP NOT NULL;

-- Matches, angles and championships must still reference an actual show.
ALTER TABLE ppw_world_news_items
 ADD CONSTRAINT ppw_world_news_offshow_event_only
 CHECK (show_id IS NOT NULL OR source_kind='EVENT');
