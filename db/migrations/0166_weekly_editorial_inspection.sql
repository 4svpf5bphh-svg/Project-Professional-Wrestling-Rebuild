-- The weekly dispatch already writes one bounded row. Keep its public prompt
-- and acceptance metadata alongside that row for the existing operator Lab.
ALTER TABLE ppw_weekly_world_editorial ADD COLUMN inspection_json jsonb
 CHECK (inspection_json IS NULL OR
  (jsonb_typeof(inspection_json)='object' AND octet_length(inspection_json::text)<=12000));

-- Only recent unresolved reports are eligible for a public follow-up.
CREATE INDEX ppw_world_rumours_recent_open
 ON ppw_world_rumour_cases(world_id,origin_week_index DESC,case_key)
 WHERE chapter<2;
