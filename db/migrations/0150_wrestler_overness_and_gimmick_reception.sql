-- One compact, index-free pair of independent 0–100 crowd connection
-- metrics. Historical people remain NULL (lazy initial baseline on read/first
-- certified appearance) to avoid a 643-worker genesis-wide UPDATE and WAL.
-- overness tracks connection distinct from awareness/popularity and momentum.
-- gimmick_reception tracks whether the current persona is connecting;
-- accepting a new persona resets only gimmick reception to neutral 50.
ALTER TABLE ppw_people
 ADD COLUMN IF NOT EXISTS overness double precision
  CHECK(overness IS NULL OR overness BETWEEN 0 AND 100),
 ADD COLUMN IF NOT EXISTS gimmick_reception double precision
  CHECK(gimmick_reception IS NULL OR gimmick_reception BETWEEN 0 AND 100);

-- Explicit IF NOT EXISTS permits safe post-interruption retry if a release
-- applied this additive schema before the Vercel deployment was held back.
