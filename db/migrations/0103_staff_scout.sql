-- Talent Scouts use the same revision-guarded staff contract desk and salary ledger.
-- All existing employment identities, roles and terms stay untouched.
ALTER TABLE ppw_staff_employments DROP CONSTRAINT ppw_staff_employments_role_check;
ALTER TABLE ppw_staff_employments ADD CONSTRAINT ppw_staff_employments_role_check
 CHECK(role IN ('TALENT_MANAGER','ROAD_AGENT','MEDICAL','CREATIVE',
  'COMMENTATOR','REFEREE','PRODUCTION','TRAINER','SCOUT'));
