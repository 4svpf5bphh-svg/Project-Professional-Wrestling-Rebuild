-- The only source of medical unavailability is a settled match injury.
-- Records become unavailable on the following weekly rollover, matching original PPW.
CREATE TABLE ppw_medical_absences (
 world_id text NOT NULL,
 person_id text NOT NULL,
 show_id text NOT NULL,
 match_id text NOT NULL,
 injured_week_index integer NOT NULL CHECK (injured_week_index>=0),
 cleared_week_index integer NOT NULL,
 weeks_out integer NOT NULL CHECK (weeks_out BETWEEN 1 AND 52),
 severity text NOT NULL CHECK (severity IN ('MINOR','MODERATE','MAJOR','SEVERE')),
 status text NOT NULL CHECK(status IN ('ACTIVE','RECOVERED')),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (world_id,person_id),
 FOREIGN KEY (world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY (world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id),
 CHECK (cleared_week_index=injured_week_index+weeks_out)
);
CREATE INDEX ppw_medical_current_week ON ppw_medical_absences
 (world_id,cleared_week_index,person_id) WHERE status='ACTIVE';
-- Full prior incident history remains in immutable match evidence.
