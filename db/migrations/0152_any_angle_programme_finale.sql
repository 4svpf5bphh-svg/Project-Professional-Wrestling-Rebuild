-- Allow any genuinely booked, active-Programme-linked angle to serve as
-- the final on-screen chapter. Existing payoff types and resolved receipts
-- stay untouched. Running twice is safe and does not rewrite historic shows.
DO $$
BEGIN
 -- PostgreSQL names the original table-level unnamed constraint "check1",
 -- not "check". Remove both historical variants on first application AND
 -- when retrying a previously half-upgraded schema.
 ALTER TABLE ppw_programme_finales
  DROP CONSTRAINT IF EXISTS ppw_programme_finales_check1;
 ALTER TABLE ppw_programme_finales
  DROP CONSTRAINT IF EXISTS ppw_programme_finales_check;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
  WHERE conrelid='ppw_programme_finales'::regclass
    AND conname='ppw_programme_finales_any_angle_payoff_check') THEN
  ALTER TABLE ppw_programme_finales
   DROP CONSTRAINT IF EXISTS ppw_programme_finales_payoff_check;
  ALTER TABLE ppw_programme_finales
   DROP CONSTRAINT IF EXISTS ppw_programme_finales_check;
  ALTER TABLE ppw_programme_finales
   ADD CONSTRAINT ppw_programme_finales_payoff_check CHECK (payoff IN (
    'FINAL_CHAPTER','DECISIVE_MATCH','TITLE_SHOWDOWN','STIPULATION_SHOWDOWN',
    'BETRAYAL','RECONCILIATION','FINAL_CONFRONTATION'));
  ALTER TABLE ppw_programme_finales
   ADD CONSTRAINT ppw_programme_finales_any_angle_payoff_check CHECK (
    (kind='MATCH' AND payoff IN
     ('DECISIVE_MATCH','TITLE_SHOWDOWN','STIPULATION_SHOWDOWN')) OR
    (kind='SEGMENT' AND payoff IN
     ('FINAL_CHAPTER','BETRAYAL','RECONCILIATION','FINAL_CONFRONTATION')));
 END IF;
END
$$;
