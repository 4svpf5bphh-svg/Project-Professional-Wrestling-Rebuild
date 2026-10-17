-- One portable character belongs to the wrestler across all PPW promotions.
-- Static 643-person guide and gimmick catalogue live in application code;
-- no giant reference JSON is duplicated in Neon.
CREATE TABLE ppw_portable_personas (
 world_id text NOT NULL,person_id text NOT NULL,
 revision integer NOT NULL DEFAULT 1 CHECK(revision BETWEEN 1 AND 100000),
 persona jsonb NOT NULL CHECK(jsonb_typeof(persona)='object'),
 provenance text NOT NULL CHECK(provenance IN
 ('CURATED','NEGOTIATED','LEGACY_MIGRATED','UNCURATED_BASELINE',
  'GAME_AUTHORED','ROSTER_APPROXIMATION')),
 introduced_week_index integer NOT NULL CHECK(introduced_week_index>=0),
 changed_by_promotion_id text,
 PRIMARY KEY(world_id,person_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,changed_by_promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE TABLE ppw_portable_persona_history (
 world_id text NOT NULL,person_id text NOT NULL,
 revision integer NOT NULL CHECK(revision BETWEEN 1 AND 100000),
 previous_persona jsonb NOT NULL CHECK(jsonb_typeof(previous_persona)='object'),
 started_week_index integer NOT NULL CHECK(started_week_index>=0),
 ended_week_index integer NOT NULL CHECK(ended_week_index>=started_week_index),
 changed_by_promotion_id text,
 PRIMARY KEY(world_id,person_id,revision),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_portable_personas(world_id,person_id),
 FOREIGN KEY(world_id,changed_by_promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_persona_history_latest
 ON ppw_portable_persona_history(world_id,person_id,revision DESC);
