-- Extend original-main shared staff employment; no snapshot blob or per-week staff rows.
-- Legacy Talent Managers keep their employment and become 52-week contracts
-- beginning at the migration's current World week, avoiding surprise expiry.
ALTER TABLE ppw_staff_employments
 DROP CONSTRAINT ppw_staff_employments_role_check;
ALTER TABLE ppw_staff_employments
 ADD CONSTRAINT ppw_staff_employments_role_check
 CHECK(role IN ('TALENT_MANAGER','ROAD_AGENT','MEDICAL','CREATIVE',
  'COMMENTATOR','REFEREE','PRODUCTION','TRAINER'));
ALTER TABLE ppw_staff_employments
 ADD COLUMN term_weeks integer NOT NULL DEFAULT 52
 CHECK(term_weeks IN (52,104));
ALTER TABLE ppw_staff_employments ADD COLUMN expires_week_index integer;
UPDATE ppw_staff_employments e
 SET expires_week_index=GREATEST(e.start_week_index,(w.year-1)*52+w.week-1)+51
 FROM ppw_worlds w WHERE w.world_id=e.world_id;
ALTER TABLE ppw_staff_employments ALTER COLUMN expires_week_index SET NOT NULL;
ALTER TABLE ppw_staff_employments
 ADD CONSTRAINT ppw_staff_contract_week_range
 CHECK(expires_week_index>=start_week_index);
-- A backward-compatible migration for staff already employed at upgrade time.
-- Existing partial indices still enforce one staff member per World and one
-- employee per role/promotion. Keep finance scans bounded to active staff.
CREATE INDEX ppw_staff_expiring_week
 ON ppw_staff_employments(world_id,expires_week_index)
 WHERE status='ACTIVE';

-- Store morale per employment; free candidates retain their World identity.
ALTER TABLE ppw_staff_employments
 ADD COLUMN morale integer NOT NULL DEFAULT 74 CHECK(morale BETWEEN 0 AND 100);
