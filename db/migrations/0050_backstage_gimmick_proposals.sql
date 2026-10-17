-- Proposals mirror original PPW: require recent completed match evidence, not
-- a random opinion or synthetic character negotiation. No stats or gimmicks
-- change when the booker merely agrees to explore the idea.
ALTER TABLE ppw_backstage_requests
 ADD COLUMN observed_average_crowd numeric(5,1)
 CHECK(observed_average_crowd BETWEEN 0 AND 100);
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_kind_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_kind_check
 CHECK(kind IN ('CONTRACT','MORALE','MOMENTUM','CREATIVE','PARTNERSHIP',
 'ROLE_USAGE','GIMMICK_PITCH'));
ALTER TABLE ppw_backstage_requests DROP CONSTRAINT ppw_backstage_requests_decision_check;
ALTER TABLE ppw_backstage_requests ADD CONSTRAINT ppw_backstage_requests_decision_check
 CHECK(decision IN ('TALK','DECLINE','PROMISE_APPEARANCE','PROMISE_SEGMENT',
 'PROMISE_FEATURED','EXPLORE_RENEWAL','MEDIATE',
 'CONSIDER_REPACKAGE','KEEP_CHARACTER'));
