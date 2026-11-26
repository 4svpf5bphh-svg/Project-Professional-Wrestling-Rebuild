-- The weekly dispatch already writes one bounded row. Keep its public prompt
-- and acceptance metadata alongside that row for the existing operator Lab.
ALTER TABLE ppw_weekly_world_editorial ADD COLUMN inspection_json jsonb
 CHECK (inspection_json IS NULL OR
  (jsonb_typeof(inspection_json)='object' AND octet_length(inspection_json::text)<=12000));
