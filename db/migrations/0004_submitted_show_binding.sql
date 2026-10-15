-- Submission is immutable once the World resolver accepts it.
-- A single promotion has at most one submitted show for a World week.
ALTER TABLE ppw_booking_drafts
  ADD CONSTRAINT ppw_booking_status_valid CHECK(status IN ('DRAFT','SUBMITTED','CANCELLED'));
CREATE UNIQUE INDEX IF NOT EXISTS ppw_one_submitted_show_per_promotion_week
ON ppw_booking_drafts(world_id,promotion_id,year,week)
WHERE status='SUBMITTED';
ALTER TABLE ppw_show_resolutions
  ADD CONSTRAINT ppw_resolved_submitted_show_fk
  FOREIGN KEY(world_id,show_id) REFERENCES ppw_booking_drafts(world_id,draft_id);
