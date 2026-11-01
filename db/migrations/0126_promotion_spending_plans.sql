-- Voluntary owner spending allocations. These are non-financial preferences:
-- no ledger debit, salary amendment, booked spend or World deadline change.
CREATE TABLE IF NOT EXISTS ppw_promotion_spending_plans(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 weekly_wage_limit bigint NOT NULL CHECK(weekly_wage_limit BETWEEN 0 AND 1000000000),
 show_talent_limit bigint NOT NULL CHECK(show_talent_limit BETWEEN 0 AND 1000000000),
 cash_reserve bigint NOT NULL CHECK(cash_reserve BETWEEN 0 AND 1000000000),
 PRIMARY KEY(world_id,promotion_id)
);
