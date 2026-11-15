-- Phase 52B: assign forward-only contractual slots to legacy active TV deals.
-- Existing certified shows and identities are never rewritten.
WITH legacy AS (
 SELECT d.world_id,d.deal_id,d.promotion_id,
  COALESCE(d.airing_day,
   (SELECT b.show_day FROM ppw_booking_drafts b
    WHERE b.world_id=d.world_id AND b.promotion_id=d.promotion_id
     AND b.booking_class='REGULAR' AND b.status IN ('SUBMITTED','DRAFT')
     AND b.show_day BETWEEN 1 AND 7
     AND (b.year-1)*52+b.week-1 BETWEEN d.start_week_index AND d.end_week_index
    ORDER BY
     CASE WHEN (b.year-1)*52+b.week-1 >= (w.year-1)*52+w.week-1 THEN 0 ELSE 1 END,
     CASE WHEN b.status='SUBMITTED' THEN 0 ELSE 1 END,
     abs((b.year-1)*52+b.week-1 - ((w.year-1)*52+w.week-1)),
     b.draft_id
    LIMIT 1),
   CASE d.offer_code
    WHEN 'BROADCAST_STABLE' THEN 6 WHEN 'BROADCAST_GROWTH' THEN 5
    WHEN 'BROADCAST_TV' THEN 6 WHEN 'BROADCAST_INDIE' THEN 5
    WHEN 'BROADCAST_ARCHIVE' THEN 7 WHEN 'BROADCAST_GLOBAL' THEN 6
    ELSE 5 END) AS chosen_day,
  COALESCE(d.airing_hour,CASE d.offer_code
    WHEN 'BROADCAST_STABLE' THEN 19 WHEN 'BROADCAST_GROWTH' THEN 20
    WHEN 'BROADCAST_TV' THEN 20 WHEN 'BROADCAST_INDIE' THEN 21
    WHEN 'BROADCAST_ARCHIVE' THEN 18 WHEN 'BROADCAST_GLOBAL' THEN 21
    ELSE 20 END) AS chosen_hour
 FROM ppw_commercial_deals d
 JOIN ppw_worlds w ON w.world_id=d.world_id
 WHERE d.kind='BROADCAST' AND d.status='ACTIVE'
  AND d.end_week_index >= (w.year-1)*52+w.week-1
  AND (d.airing_day IS NULL OR d.airing_hour IS NULL)
), upgraded AS (
 UPDATE ppw_commercial_deals d
 SET airing_day=l.chosen_day,airing_hour=l.chosen_hour
 FROM legacy l
 WHERE d.world_id=l.world_id AND d.deal_id=l.deal_id
 RETURNING d.world_id,d.deal_id,d.promotion_id,
  d.start_week_index,d.end_week_index,d.airing_day,d.airing_hour
), realigned AS (
 UPDATE ppw_booking_drafts b
 SET show_day=u.airing_day,lock_ready_by_player_id=NULL,
  lock_ready_fingerprint=NULL,booking_expected_demand=NULL,
  booking_ticket_yield=NULL,booking_snapshot_fingerprint=NULL,revision=b.revision+1
 FROM upgraded u
 JOIN ppw_worlds w ON w.world_id=u.world_id
 WHERE b.world_id=u.world_id AND b.promotion_id=u.promotion_id
  AND b.booking_class='REGULAR' AND b.status='DRAFT'
  AND b.show_day IS DISTINCT FROM u.airing_day
  AND (b.year-1)*52+b.week-1
   BETWEEN greatest((w.year-1)*52+w.week-1,u.start_week_index)
    AND u.end_week_index
 RETURNING b.world_id,b.promotion_id,b.draft_id
)
INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
SELECT u.world_id,w.year,w.week,'BROADCAST_SLOT_RECOVERED',
 jsonb_build_object('promotionId',u.promotion_id,'dealId',u.deal_id,
  'day',u.airing_day,'hour',u.airing_hour,
  'effectiveWeekIndex',greatest((w.year-1)*52+w.week-1,u.start_week_index),
  'adjustedDrafts',(SELECT count(*) FROM realigned a
   WHERE a.world_id=u.world_id AND a.promotion_id=u.promotion_id),
  'reason','LEGACY_CONTRACT_SLOT_RECOVERY')
FROM upgraded u JOIN ppw_worlds w ON w.world_id=u.world_id;
