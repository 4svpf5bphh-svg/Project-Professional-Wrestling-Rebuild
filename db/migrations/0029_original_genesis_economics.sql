-- Normalized original Genesis economy. Never persist a whole WorldState JSONB.
-- Nullable for existing development fixtures; trusted Genesis bootstrap supplies
-- all values. These are original recurring finance/venue terms, not new rules.
ALTER TABLE ppw_promotions
 ADD COLUMN weekly_media_income bigint CHECK(weekly_media_income>=0),
 ADD COLUMN weekly_sponsor_income bigint CHECK(weekly_sponsor_income>=0),
 ADD COLUMN weekly_fixed_overhead bigint CHECK(weekly_fixed_overhead>=0),
 ADD COLUMN last_weekly_net bigint,
 ADD COLUMN financial_distress text
 CHECK(financial_distress IN ('HEALTHY','WATCH','DISTRESSED','CRISIS'));
ALTER TABLE ppw_venues
 ADD COLUMN capacity integer CHECK(capacity>0),
 ADD COLUMN weekly_hire_cost bigint CHECK(weekly_hire_cost>=0),
 ADD COLUMN prestige double precision CHECK(prestige BETWEEN 0 AND 100),
 ADD COLUMN production_suitability double precision
 CHECK(production_suitability BETWEEN 0 AND 100);
-- Indexed keys already exist: World, promotion, wrestler, venue and contract
-- primary keys. No duplicate read-model tables or historical snapshots.
