-- Record the exact already-authorized participant identities in the
-- existing one-row-per-show appearance settlement, with no additional SQL.
-- Historic NULL means "not recorded", never a false empty roster.
ALTER TABLE ppw_show_resolutions ADD COLUMN appearance_person_ids jsonb
 CHECK (appearance_person_ids IS NULL OR
  (jsonb_typeof(appearance_person_ids)='array' AND
   jsonb_array_length(appearance_person_ids)=performers_count));
