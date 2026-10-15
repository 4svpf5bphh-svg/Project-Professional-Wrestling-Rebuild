-- The one weekly deadline remains unchanged. These fields are the venue/day
-- of a submitted show; two promotions may have competing provisional plans.
-- Do NOT add a winner-takes-first unique venue index: time of submission
-- cannot decide scarce-resource priority in an asynchronous multiplayer World.
ALTER TABLE ppw_booking_drafts
  ADD COLUMN show_day smallint CHECK (show_day BETWEEN 1 AND 7),
  ADD COLUMN venue_id text CHECK (venue_id IS NULL OR (length(venue_id) BETWEEN 1 AND 200));
-- Day and venue must become mandatory at the *submission command* boundary,
-- not the DRAFT schema: early drafts are intentionally incomplete.
