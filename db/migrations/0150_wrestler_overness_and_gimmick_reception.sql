-- One compact, index-free pair of independent 0–100 crowd connection
-- metrics. Historical people remain NULL (lazy initial baseline on read/first
-- certified appearance) to avoid a 643-worker genesis-wide UPDATE and WAL.
-- overness tracks connection distinct from awareness/popularity and momentum.
-- gimmick_reception tracks whether the current persona is connecting;
-- accepting a new persona resets only gimmick reception to neutral 50.
ALTER TABLE ppw_people
 ADD COLUMN overness double precision
  CHECK(overness IS NULL OR overness BETWEEN 0 AND 100),
 ADD COLUMN gimmick_reception double precision
  CHECK(gimmick_reception IS NULL OR gimmick_reception BETWEEN 0 AND 100);
