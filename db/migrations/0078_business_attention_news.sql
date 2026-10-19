-- Index verified annual and financial notices for the owner's Home desk.
CREATE INDEX ppw_ledger_business_news
 ON ppw_ledger_events(world_id,year DESC,week DESC,event_id DESC)
 WHERE event_type IN ('PROMOTION_STANDING_UPDATED','FINANCIAL_DISTRESS_CHANGED');
