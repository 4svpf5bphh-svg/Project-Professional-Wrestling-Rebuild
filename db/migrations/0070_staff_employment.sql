-- Original-main unique fictional World Talent Managers, now employable without
-- serialising staff into a World JSON blob. The eight-person source catalog is
-- deterministically derived from ppw_worlds.seed, not duplicated in storage.
CREATE TABLE ppw_staff_employments(
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 employment_id text NOT NULL,
 staff_id text NOT NULL CHECK(length(staff_id) BETWEEN 1 AND 200),
 promotion_id text NOT NULL,
 role text NOT NULL DEFAULT 'TALENT_MANAGER' CHECK(role='TALENT_MANAGER'),
 status text NOT NULL CHECK(status IN('ACTIVE','ENDED')),
 weekly_salary bigint NOT NULL CHECK(weekly_salary>=0),
 start_week_index integer NOT NULL CHECK(start_week_index>=0),
 ended_week_index integer,
 PRIMARY KEY(world_id,employment_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 CHECK((status='ACTIVE' AND ended_week_index IS NULL) OR
       (status='ENDED' AND ended_week_index>=start_week_index))
);
CREATE UNIQUE INDEX ppw_one_active_world_staff_member
 ON ppw_staff_employments(world_id,staff_id) WHERE status='ACTIVE';
CREATE UNIQUE INDEX ppw_one_active_talent_manager
 ON ppw_staff_employments(world_id,promotion_id,role) WHERE status='ACTIVE';
CREATE INDEX ppw_staff_payroll
 ON ppw_staff_employments(world_id,promotion_id)
 INCLUDE(weekly_salary) WHERE status='ACTIVE';
