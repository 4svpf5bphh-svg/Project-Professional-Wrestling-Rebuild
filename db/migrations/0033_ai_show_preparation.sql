-- Preserve original calendar cadence and AI ticket caution on the
-- normalized entities. Nullable on old test Worlds, enforced for Genesis.
ALTER TABLE ppw_worlds ADD COLUMN major_event_interval_weeks integer
 CHECK(major_event_interval_weeks IS NULL OR major_event_interval_weeks BETWEEN 1 AND 104);
ALTER TABLE ppw_promotions ADD COLUMN ai_financial_caution double precision
 CHECK(ai_financial_caution IS NULL OR ai_financial_caution BETWEEN 0 AND 100);
ALTER TABLE ppw_promotions ADD COLUMN event_cadence_weeks integer
 CHECK(event_cadence_weeks IS NULL OR event_cadence_weeks BETWEEN 1 AND 52);
ALTER TABLE ppw_booking_drafts DROP CONSTRAINT IF EXISTS ppw_booking_drafts_booking_origin_check;
ALTER TABLE ppw_booking_drafts ADD CONSTRAINT ppw_booking_drafts_booking_origin_check
 CHECK(booking_origin IN ('PLAYER','STAFF_FALLBACK','AI'));
