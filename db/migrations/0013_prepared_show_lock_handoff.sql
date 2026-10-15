-- Explicit, owner-confirmed ready-to-run marker, invalidated if the actual
-- schedule or authored slots no longer match the readiness fingerprint.
ALTER TABLE ppw_booking_drafts
  ADD COLUMN lock_ready_by_player_id text,
  ADD COLUMN lock_ready_fingerprint char(64),
  ADD CONSTRAINT ppw_draft_lock_ready_pair CHECK (
    (lock_ready_by_player_id IS NULL AND lock_ready_fingerprint IS NULL) OR
    (lock_ready_by_player_id IS NOT NULL AND length(lock_ready_by_player_id)>0 AND
     lock_ready_fingerprint IS NOT NULL AND length(lock_ready_fingerprint)=64)
  );
CREATE INDEX ppw_lock_ready_drafts_by_week
  ON ppw_booking_drafts(world_id,year,week)
  WHERE status='DRAFT' AND lock_ready_fingerprint IS NOT NULL;
-- One bounded result for the current weekly Lock, never a second deadline.
CREATE TABLE ppw_week_prepared_finalizations (
  world_id text NOT NULL REFERENCES ppw_worlds(world_id),
  year integer NOT NULL CHECK(year>0),
  week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
  submitted_count integer NOT NULL CHECK(submitted_count>=0),
  review_count integer NOT NULL CHECK(review_count>=0),
  command_request_id text NOT NULL,
  PRIMARY KEY(world_id,year,week),
  UNIQUE(world_id,command_request_id)
);
