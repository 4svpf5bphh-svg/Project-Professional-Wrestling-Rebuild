
-- Phase 5: explicit championship hierarchy BEFORE any new secondary-title
-- activation; existing founding titles keep their canonical holders/reigns.
ALTER TABLE ppw_championships
 ADD COLUMN title_role text NOT NULL DEFAULT 'PRIMARY'
  CHECK(title_role IN ('PRIMARY','SECONDARY')),
 ADD COLUMN last_contest_week_index integer CHECK(last_contest_week_index>=0),
 ADD COLUMN last_prestige_change double precision NOT NULL DEFAULT 0
  CHECK(last_prestige_change BETWEEN -5 AND 5);
-- SINGLES is deliberately broader than men's/women's or brand identities.
-- Several genuine top-tier titles may exist in one promotion/division (for
-- example two flagship brands). Never silently demote an established belt.
-- A new secondary title must instead be explicitly marked SECONDARY by its
-- authorised creation workflow, before it may be activated.
CREATE INDEX ppw_titles_role_directory
 ON ppw_championships(world_id,promotion_id,division,title_role,status);
UPDATE ppw_championships c SET last_contest_week_index=verified.week_index
FROM (
 SELECT x.world_id,x.promotion_id,x.championship_id,
  max((done.year-1)*52+done.week-1)::integer AS week_index
 FROM ppw_championship_contests x JOIN ppw_completed_shows done
 ON done.world_id=x.world_id AND done.show_id=x.show_id
  AND done.promotion_id=x.promotion_id
 GROUP BY x.world_id,x.promotion_id,x.championship_id
) verified
WHERE c.world_id=verified.world_id AND c.promotion_id=verified.promotion_id
 AND c.championship_id=verified.championship_id;

-- Earned event tradition is distinct from the owner's editable broadcast
-- importance. This preserves past booking branding, dates and receipts.
ALTER TABLE ppw_show_series
 ADD COLUMN earned_prestige double precision NOT NULL DEFAULT 0
  CHECK(earned_prestige BETWEEN 0 AND 100),
 ADD COLUMN celebrated_editions integer NOT NULL DEFAULT 0
  CHECK(celebrated_editions>=0),
 ADD COLUMN last_celebrated_week_index integer
  CHECK(last_celebrated_week_index>=0),
 ADD COLUMN last_prestige_change double precision NOT NULL DEFAULT 0
  CHECK(last_prestige_change BETWEEN -5 AND 5);

-- The one World transaction owns the only mutation. A replay never adjusts
-- prestige twice, even if a safe/manual resolution retried the same week.
CREATE TABLE ppw_heritage_week_settlements(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id) ON DELETE CASCADE,
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 PRIMARY KEY(world_id,year,week)
);
