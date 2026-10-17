-- Previously created Planner drafts omitted this simulator-required score.
-- Patch only the active/future planning horizon, never scan archived Worlds.
-- Brand importance is frozen with the booked card and does not change when
-- the optional Show Calendar identity is later renamed.
UPDATE ppw_booking_drafts d
 SET event_importance=COALESCE(
  (SELECT s.importance FROM ppw_show_series s
   WHERE s.world_id=d.world_id AND s.promotion_id=d.promotion_id
     AND s.series_id=d.show_series_id),
  CASE WHEN d.booking_class='PREMIUM' OR d.event_type='MAJOR'
   THEN 87 ELSE 70 END)
 FROM ppw_worlds w
 WHERE d.world_id=w.world_id AND d.event_importance IS NULL
  AND d.status IN ('DRAFT','SUBMITTED')
  AND (d.year-1)*52+d.week-1 >= (w.year-1)*52+w.week-1;
