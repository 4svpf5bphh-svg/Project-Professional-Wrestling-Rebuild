-- A friendly conversation cannot silently renew an exclusive or limited
-- contract. Verified negotiation request facts are reflected in Backstage.
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_follow_through_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_follow_through_kind_check
 CHECK(follow_through_kind IN ('TAG_MATCH_BOOKED','RIVALRY_PROGRAMME_STARTED',
  'MEDIATION_MATCH_COMPLETED','CONTRACT_NEGOTIATION_STARTED'));
CREATE INDEX ppw_backstage_contract_followthrough ON ppw_backstage_requests
 (world_id,source_contract_id,responded_week_index)
 WHERE kind='CONTRACT' AND decision='EXPLORE_RENEWAL'
 AND follow_through_week_index IS NULL;
