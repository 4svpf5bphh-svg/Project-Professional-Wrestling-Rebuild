-- Person-keyed live segment evidence only for deliberate wrestler career opening.
-- JSONB containment uses one narrow partial GIN index; no new World writes,
-- polling, roster scans or denormalised per-person appearance records.
CREATE INDEX ppw_completed_live_angle_cast
 ON ppw_completed_show_segments USING GIN (story_json jsonb_path_ops)
 WHERE kind<>'VIDEO_PACKAGE' AND authored_outcome IN ('HAPPENS','INTERRUPTED');
-- The existing show PK is show-keyed, not promotion-keyed; this index
-- bounds historical proof/completeness checks to one company.
CREATE INDEX ppw_completed_shows_company_history
 ON ppw_completed_shows(world_id,promotion_id,show_id);
