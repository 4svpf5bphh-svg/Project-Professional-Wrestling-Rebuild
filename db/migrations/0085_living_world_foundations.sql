-- Original main career identity and durable lifecycle, never WorldState snapshots.
-- NULL is intentional for older Worlds without verified original-person age/aptitude.
ALTER TABLE ppw_people
 ADD COLUMN biological_age double precision CHECK(biological_age BETWEEN 0 AND 120),
 ADD COLUMN career_experience double precision CHECK(career_experience BETWEEN 0 AND 100),
 ADD COLUMN development_aptitude double precision CHECK(development_aptitude BETWEEN 0 AND 100),
 ADD COLUMN generated_talent boolean NOT NULL DEFAULT false,
 ADD COLUMN debut_week_index integer CHECK(debut_week_index>=0),
 ADD COLUMN home_market_id text,
 ADD CONSTRAINT ppw_person_home_market FOREIGN KEY(world_id,home_market_id)
 REFERENCES ppw_markets(world_id,market_id);
-- Existing career_stage/morale are already normalized; do not duplicate them.
-- Original promotion-talent trust is distinct from wrestler-to-wrestler chemistry.
CREATE TABLE ppw_promotion_talent_trust (
 world_id text NOT NULL,promotion_id text NOT NULL,person_id text NOT NULL,
 trust double precision NOT NULL DEFAULT 50 CHECK(trust BETWEEN 0 AND 100),
 last_evaluated_year integer NOT NULL DEFAULT 0 CHECK(last_evaluated_year>=0),
 PRIMARY KEY(world_id,promotion_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
-- Indexed annual company survival counters, one row per promotion (not per week).
CREATE TABLE ppw_promotion_survival (
 world_id text NOT NULL,promotion_id text NOT NULL,
 baseline_weekly_fixed_overhead bigint NOT NULL CHECK(baseline_weekly_fixed_overhead>=0),
 baseline_event_cadence_weeks integer NOT NULL CHECK(baseline_event_cadence_weeks BETWEEN 1 AND 52),
 stress_weeks integer NOT NULL DEFAULT 0 CHECK(stress_weeks>=0),
 crisis_weeks integer NOT NULL DEFAULT 0 CHECK(crisis_weeks>=0),
 understaffed_weeks integer NOT NULL DEFAULT 0 CHECK(understaffed_weeks>=0),
 healthy_weeks integer NOT NULL DEFAULT 0 CHECK(healthy_weeks>=0),
 restructuring_count integer NOT NULL DEFAULT 0 CHECK(restructuring_count>=0),
 last_restructure_week_index integer,
 dormant_since_week_index integer,
 PRIMARY KEY(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
