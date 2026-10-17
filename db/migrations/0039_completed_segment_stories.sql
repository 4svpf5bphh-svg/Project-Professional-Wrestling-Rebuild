-- Canonical angle narratives and consequence intents are persisted with the
-- resolved segment, never fetched from a mutable draft on a later results view.
-- Nullable for historic rows and archived receipt fixture imports.
ALTER TABLE ppw_completed_show_segments
 ADD COLUMN story_json jsonb
 CHECK(story_json IS NULL OR jsonb_typeof(story_json)='object');
