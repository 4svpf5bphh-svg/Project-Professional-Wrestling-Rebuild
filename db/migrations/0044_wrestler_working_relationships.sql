-- Original PPW cross-promotion working partnerships: factual chemistry, not scripted animosity.
-- No per-week World snapshot or duplicated roster for Neon. Evidence stays compact.
CREATE TABLE ppw_wrestler_relationships(
 world_id text NOT NULL,person_a_id text NOT NULL,person_b_id text NOT NULL,
 affinity double precision NOT NULL DEFAULT 0 CHECK(affinity BETWEEN -100 AND 100),
 professional_trust double precision NOT NULL DEFAULT 50 CHECK(professional_trust BETWEEN -100 AND 100),
 familiarity double precision NOT NULL DEFAULT 0 CHECK(familiarity BETWEEN 0 AND 100),
 rivalry_heat double precision NOT NULL DEFAULT 0 CHECK(rivalry_heat BETWEEN 0 AND 100),
 tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(tags)='array'),
 last_improved_week_index integer,
 last_strained_week_index integer,
 last_change_week_index integer,
 last_change_type text CHECK(last_change_type IN('IMPROVEMENT','STRAIN')),
 PRIMARY KEY(world_id,person_a_id,person_b_id),
 FOREIGN KEY(world_id,person_a_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,person_b_id) REFERENCES ppw_people(world_id,person_id),
 CHECK(person_a_id < person_b_id)
);
CREATE INDEX ppw_relationships_by_other_wrestler
 ON ppw_wrestler_relationships(world_id,person_b_id,person_a_id);
CREATE TABLE ppw_tag_working_pair_appearances(
 world_id text NOT NULL,show_id text NOT NULL,match_id text NOT NULL,
 person_a_id text NOT NULL,person_b_id text NOT NULL,
 week_index integer NOT NULL CHECK(week_index>=0),
 execution_quality double precision NOT NULL CHECK(execution_quality BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,show_id,match_id,person_a_id,person_b_id),
 FOREIGN KEY(world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id),
 FOREIGN KEY(world_id,person_a_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,person_b_id) REFERENCES ppw_people(world_id,person_id),
 CHECK(person_a_id < person_b_id)
);
CREATE INDEX ppw_tag_pair_evidence_recent
 ON ppw_tag_working_pair_appearances(world_id,person_a_id,person_b_id,week_index DESC);
CREATE INDEX ppw_tag_pair_evidence_other
 ON ppw_tag_working_pair_appearances(world_id,person_b_id,week_index DESC);
CREATE TABLE ppw_wrestler_relationship_changes(
 world_id text NOT NULL,person_a_id text NOT NULL,person_b_id text NOT NULL,
 week_index integer NOT NULL CHECK(week_index>=0),
 show_id text NOT NULL,match_id text NOT NULL,
 change_type text NOT NULL CHECK(change_type IN('IMPROVEMENT','STRAIN')),
 trust_delta double precision NOT NULL CHECK(trust_delta BETWEEN -1 AND 1),
 familiarity_delta double precision NOT NULL CHECK(familiarity_delta BETWEEN 0 AND 2),
 verified_shows integer NOT NULL CHECK(verified_shows>=2),
 PRIMARY KEY(world_id,person_a_id,person_b_id,week_index),
 FOREIGN KEY(world_id,person_a_id,person_b_id)
  REFERENCES ppw_wrestler_relationships(world_id,person_a_id,person_b_id),
 FOREIGN KEY(world_id,show_id,match_id)
  REFERENCES ppw_completed_show_matches(world_id,show_id,match_id)
);
CREATE INDEX ppw_relationship_changes_by_other
 ON ppw_wrestler_relationship_changes(world_id,person_b_id,week_index DESC);
