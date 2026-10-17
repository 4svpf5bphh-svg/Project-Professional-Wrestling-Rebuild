-- Freeze the show brand at scheduling time; editing or archiving a
-- recurring calendar identity must never rewrite a completed PPV's name.
ALTER TABLE ppw_booking_drafts ADD COLUMN show_name text
 CHECK (show_name IS NULL OR length(show_name) BETWEEN 1 AND 80);
