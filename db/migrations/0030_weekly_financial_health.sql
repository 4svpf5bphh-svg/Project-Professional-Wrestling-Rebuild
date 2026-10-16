-- Original finance runway is stored once at weekly World rollover.
-- Only indexed *current-week financial events* contribute to the current
-- week P&L. Historical events never enter an ordinary player read.
ALTER TABLE ppw_promotions ADD COLUMN runway_weeks double precision
 CHECK (runway_weeks IS NULL OR (runway_weeks>=0 AND runway_weeks<=100000000));
CREATE INDEX ppw_ledger_week_finance
 ON ppw_ledger_events(world_id,year,week,event_type)
 WHERE event_type IN ('CONTRACT_SIGNED','CONTRACT_EXTRA_DATES_ACCEPTED',
  'CONTRACT_APPEARANCE_FEES','CONTRACT_GUARANTEE_PAID',
  'PROMOTION_RECURRING_FINANCES');
