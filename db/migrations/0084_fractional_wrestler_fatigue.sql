-- Original PPW applies fractional fatigue recovery each new World week.
-- Preserve one-decimal attributes in PostgreSQL rather than rounding to the
-- old smallint columns. This is an additive in-place type widening: no reset.
ALTER TABLE ppw_people ALTER COLUMN fatigue TYPE double precision
 USING fatigue::double precision;
ALTER TABLE ppw_people ALTER COLUMN wear TYPE double precision
 USING wear::double precision;
