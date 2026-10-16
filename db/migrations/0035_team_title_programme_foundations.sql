-- World-owned tag identities, promotion-owned titles and programmes.
-- Identity is portable; no per-promotion duplicate wrestler/active team.
CREATE TABLE ppw_tag_teams (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 team_id text NOT NULL,
 name text NOT NULL CHECK(length(name)>0),
 status text NOT NULL CHECK(status IN('ACTIVE','DISBANDED')),
 PRIMARY KEY(world_id,team_id)
);
CREATE TABLE ppw_tag_team_members (
 world_id text NOT NULL,team_id text NOT NULL,person_id text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(world_id,team_id,person_id),
 FOREIGN KEY(world_id,team_id) REFERENCES ppw_tag_teams(world_id,team_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_active_team_members ON ppw_tag_team_members(world_id,person_id,team_id)
 WHERE active;
CREATE TABLE ppw_championships (
 world_id text NOT NULL,promotion_id text NOT NULL,
 championship_id text NOT NULL,name text NOT NULL CHECK(length(name)>0),
 division text NOT NULL CHECK(division IN('SINGLES','TAG')),
 status text NOT NULL CHECK(status IN('ACTIVE','INACTIVE')),
 prestige double precision NOT NULL CHECK(prestige BETWEEN 0 AND 100),
 current_reign_id text,
 PRIMARY KEY(world_id,promotion_id,championship_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE TABLE ppw_championship_reigns (
 world_id text NOT NULL,promotion_id text NOT NULL,
 championship_id text NOT NULL,reign_id text NOT NULL,
 holder_type text NOT NULL CHECK(holder_type IN('PERSON','TEAM')),
 person_id text,team_id text,
 status text NOT NULL CHECK(status IN('ACTIVE','ENDED')),
 start_week_index integer NOT NULL CHECK(start_week_index>=0),
 ended_week_index integer CHECK(ended_week_index IS NULL OR ended_week_index>=start_week_index),
 defenses integer NOT NULL DEFAULT 0 CHECK(defenses>=0),
 PRIMARY KEY(world_id,promotion_id,championship_id,reign_id),
 FOREIGN KEY(world_id,promotion_id,championship_id)
  REFERENCES ppw_championships(world_id,promotion_id,championship_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,team_id) REFERENCES ppw_tag_teams(world_id,team_id),
 CHECK((holder_type='PERSON' AND person_id IS NOT NULL AND team_id IS NULL) OR
       (holder_type='TEAM' AND team_id IS NOT NULL AND person_id IS NULL))
);
CREATE UNIQUE INDEX ppw_one_active_reign_per_title
 ON ppw_championship_reigns(world_id,promotion_id,championship_id)
 WHERE status='ACTIVE';
CREATE INDEX ppw_holder_reigns ON ppw_championship_reigns(world_id,promotion_id,person_id)
 WHERE status='ACTIVE' AND person_id IS NOT NULL;
-- Both sides must be genuine booked wrestlers. A programme may have more
-- than two participants, but its active singles rivalry slot is 1v1.
CREATE TABLE ppw_programme_participants (
 world_id text NOT NULL,promotion_id text NOT NULL,
 programme_id text NOT NULL,person_id text NOT NULL,
 side text NOT NULL CHECK(side IN('A','B')),
 PRIMARY KEY(world_id,promotion_id,programme_id,person_id),
 FOREIGN KEY(world_id,promotion_id,programme_id)
  REFERENCES ppw_programmes(world_id,promotion_id,programme_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_programme_person ON ppw_programme_participants(world_id,promotion_id,person_id);
-- This state is reserved for title outcome integration. No title-changing
-- matches may be designated before the canonical resolution can settle it.

CREATE TABLE ppw_championship_contests (
 world_id text NOT NULL,promotion_id text NOT NULL,
 championship_id text NOT NULL,show_id text NOT NULL,slot_id text NOT NULL,
 prior_reign_id text NOT NULL,winner_person_id text NOT NULL,
 title_changed boolean NOT NULL,
 PRIMARY KEY(world_id,promotion_id,championship_id,show_id,slot_id),
 FOREIGN KEY(world_id,promotion_id,championship_id)
  REFERENCES ppw_championships(world_id,promotion_id,championship_id),
 FOREIGN KEY(world_id,show_id,slot_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id),
 FOREIGN KEY(world_id,winner_person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_title_contests_by_show ON ppw_championship_contests(world_id,show_id);
