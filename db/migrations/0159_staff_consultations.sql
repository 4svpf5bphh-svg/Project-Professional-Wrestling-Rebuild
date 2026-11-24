-- Private bounded editorial cache. No World events or scheduler.
CREATE TABLE IF NOT EXISTS ppw_staff_consultations(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 promotion_id text NOT NULL,player_id text NOT NULL,
 week_index integer NOT NULL CHECK(week_index>=0),
 digest text NOT NULL CHECK(length(digest)=64),
 state text NOT NULL CHECK(state IN ('PENDING','READY','FAILED')),
 copy_json jsonb,
 PRIMARY KEY(world_id,promotion_id,player_id),
 CHECK((state='READY' AND copy_json IS NOT NULL AND jsonb_typeof(copy_json)='object'
  AND length(copy_json::text)<=4000) OR (state<>'READY' AND copy_json IS NULL))
);
