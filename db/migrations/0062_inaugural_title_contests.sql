-- Vacant championship matches have no prior reign. A verified clean finish
-- establishes the inaugural champion; protected/non-clean finishes leave it vacant.
ALTER TABLE ppw_championship_contests ALTER COLUMN prior_reign_id DROP NOT NULL;
