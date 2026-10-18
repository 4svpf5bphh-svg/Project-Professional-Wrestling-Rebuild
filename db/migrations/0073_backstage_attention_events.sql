-- Rare already-published wrestler-promise updates. Avoid scanning the
-- ordinary match/economy ledger for the player's Home news feed.
CREATE INDEX IF NOT EXISTS ppw_recent_backstage_settlements
 ON ppw_ledger_events(world_id,event_id DESC)
 WHERE event_type IN ('BACKSTAGE_PROMISE_FULFILLED','BACKSTAGE_PROMISE_BROKEN');
