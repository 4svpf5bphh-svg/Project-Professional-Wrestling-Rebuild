-- The archived simulator mutates these fields at tenth/hundredth precision.
-- The old early-rebuild smallint fields would silently truncate game progression.
-- PostgreSQL float8 matches the original JavaScript number arithmetic;
-- existing [0,100] CHECK constraints remain in force.
ALTER TABLE ppw_people
 ALTER COLUMN fatigue TYPE double precision USING fatigue::double precision,
 ALTER COLUMN wear TYPE double precision USING wear::double precision,
 ALTER COLUMN momentum TYPE double precision USING momentum::double precision,
 ALTER COLUMN popularity TYPE double precision USING popularity::double precision,
 ALTER COLUMN recognition TYPE double precision USING recognition::double precision;
-- Legacy show exposure depends on a promotion's current media reach.
-- Unknown until legacy promotion data migrates; never assume a fake default.
ALTER TABLE ppw_promotions
 ADD COLUMN media_reach double precision
 CHECK (media_reach>=0 AND media_reach<=1000000);
