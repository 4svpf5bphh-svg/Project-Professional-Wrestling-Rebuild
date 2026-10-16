-- Capture original demand at player-confirmed booking (not result time).
-- Nullable for pre-commercial development Worlds; mandatory at trusted
-- booking/World certification boundaries when show_economics_enabled=true.
ALTER TABLE ppw_booking_drafts
 ADD COLUMN booking_expected_demand integer CHECK (booking_expected_demand>=100),
 ADD COLUMN booking_ticket_yield numeric(10,2) CHECK (booking_ticket_yield>0),
 ADD COLUMN booking_snapshot_fingerprint text CHECK (
  booking_snapshot_fingerprint IS NULL OR length(booking_snapshot_fingerprint)=64);
ALTER TABLE ppw_show_economics
 ADD COLUMN average_match_rating numeric(4,2) CHECK (
  average_match_rating IS NULL OR average_match_rating BETWEEN 0.5 AND 5);
