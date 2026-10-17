-- A promotion has one required normal weekly show and may elect one
-- additional independently authored PPV. Legacy show drafts remain REGULAR.
-- No weekly occurrence rows, background tasks or extra World Lock.
ALTER TABLE ppw_booking_drafts
 ADD COLUMN booking_class text NOT NULL DEFAULT 'REGULAR'
 CHECK (booking_class IN ('REGULAR','PREMIUM')),
 ADD COLUMN show_series_id text;
DROP INDEX ppw_one_submitted_show_per_promotion_week;
CREATE UNIQUE INDEX ppw_one_submitted_show_per_promotion_week_and_class
 ON ppw_booking_drafts(world_id,promotion_id,year,week,booking_class)
 WHERE status='SUBMITTED';
CREATE INDEX ppw_drafts_week_class
 ON ppw_booking_drafts(world_id,promotion_id,year,week,booking_class)
 WHERE status IN ('DRAFT','SUBMITTED');
