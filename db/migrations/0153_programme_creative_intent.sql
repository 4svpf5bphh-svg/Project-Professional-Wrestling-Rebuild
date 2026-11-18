-- Repeatable owner-authored Story Blueprint metadata on the original Programme.
-- Existing worlds, resolved stories and booking tables remain unchanged.
ALTER TABLE ppw_programmes ADD COLUMN IF NOT EXISTS creative_intent jsonb;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='ppw_programmes'::regclass
   AND conname='ppw_programmes_creative_intent_shape') THEN
  ALTER TABLE ppw_programmes ADD CONSTRAINT ppw_programmes_creative_intent_shape
   CHECK (creative_intent IS NULL OR
    (jsonb_typeof(creative_intent)='object' AND
     jsonb_typeof(creative_intent->'blueprintId')='string' AND
     jsonb_typeof(creative_intent->'motivation')='string' AND
     jsonb_typeof(creative_intent->'audienceGoal')='string' AND
     jsonb_typeof(creative_intent->'destination')='string'));
 END IF;
END $$;
