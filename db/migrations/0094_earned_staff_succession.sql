
-- Only verified retired performers qualify for new staff identities.
-- Their original person_id and career history remain authoritative.
CREATE TABLE ppw_staff_alumni(
 world_id text NOT NULL,
 person_id text NOT NULL,
 staff_id text NOT NULL CHECK(length(staff_id) BETWEEN 1 AND 200),
 role text NOT NULL CHECK(role IN ('ROAD_AGENT','TRAINER','COMMENTATOR','CREATIVE')),
 craft integer NOT NULL CHECK(craft BETWEEN 0 AND 100),
 people integer NOT NULL CHECK(people BETWEEN 0 AND 100),
 reliability integer NOT NULL CHECK(reliability BETWEEN 0 AND 100),
 weekly_salary integer NOT NULL CHECK(weekly_salary BETWEEN 1 AND 1000000),
 personality text NOT NULL CHECK(personality IN ('FRANK','PATIENT','AMBITIOUS','LOYAL','ECCENTRIC')),
 specialism text NOT NULL CHECK(length(specialism) BETWEEN 1 AND 100),
 career_summary text NOT NULL CHECK(length(career_summary) BETWEEN 1 AND 200),
 qualified_week_index integer NOT NULL CHECK(qualified_week_index>=0),
 PRIMARY KEY(world_id,person_id),
 UNIQUE(world_id,staff_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_staff_alumni_market ON ppw_staff_alumni
(world_id,qualified_week_index DESC,person_id);
