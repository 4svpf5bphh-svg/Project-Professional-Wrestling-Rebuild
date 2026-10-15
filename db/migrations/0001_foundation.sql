-- PPW relational foundation. No monolithic World JSON snapshots.
CREATE TABLE ppw_worlds (
 world_id text PRIMARY KEY, name text NOT NULL, seed bigint NOT NULL,
 ruleset_version text NOT NULL, schema_version integer NOT NULL DEFAULT 1,
 year integer NOT NULL DEFAULT 1 CHECK (year > 0),
 week integer NOT NULL DEFAULT 1 CHECK (week BETWEEN 1 AND 52),
 day integer NOT NULL DEFAULT 1 CHECK (day BETWEEN 1 AND 7),
 phase text NOT NULL DEFAULT 'OPEN' CHECK (phase IN ('OPEN','LOCKED','RESOLVING')),
 revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ppw_players (
 player_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ppw_promotions (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 promotion_id text NOT NULL, name text NOT NULL,
 tier text NOT NULL, lifecycle text NOT NULL DEFAULT 'ACTIVE',
 cash bigint NOT NULL DEFAULT 0, debt bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(world_id,promotion_id)
);
CREATE TABLE ppw_memberships (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 status text NOT NULL CHECK(status IN ('ACTIVE','INACTIVE')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,player_id)
);
CREATE TABLE ppw_promotion_controls (
 world_id text NOT NULL, player_id text NOT NULL,
 promotion_id text NOT NULL, active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(world_id,player_id,promotion_id),
 FOREIGN KEY(world_id,player_id) REFERENCES ppw_memberships(world_id,player_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE UNIQUE INDEX ppw_one_active_promotion_per_player ON ppw_promotion_controls(world_id,player_id) WHERE active;
CREATE UNIQUE INDEX ppw_one_active_controller_per_promotion ON ppw_promotion_controls(world_id,promotion_id) WHERE active;
CREATE TABLE ppw_people (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 person_id text NOT NULL, name text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE',
 PRIMARY KEY(world_id,person_id)
);
CREATE TABLE ppw_contracts (
 world_id text NOT NULL, contract_id text NOT NULL,
 person_id text NOT NULL, promotion_id text NOT NULL,
 family text NOT NULL CHECK(family IN ('ONE_OFF','LIMITED_NON_EXCLUSIVE','EXCLUSIVE')),
 status text NOT NULL CHECK(status IN ('SIGNED','EXPIRED','TERMINATED')),
 remaining_dates integer CHECK(remaining_dates IS NULL OR remaining_dates >= 0),
 expires_week_index integer NOT NULL CHECK(expires_week_index >= 0),
 revision bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(world_id,contract_id),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_contracts_promotion_active ON ppw_contracts(world_id,promotion_id,status);
CREATE INDEX ppw_contracts_person_active ON ppw_contracts(world_id,person_id,status);
CREATE TABLE ppw_booking_drafts (
 world_id text NOT NULL, draft_id text NOT NULL, promotion_id text NOT NULL,
 year integer NOT NULL, week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 revision bigint NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'DRAFT',
 PRIMARY KEY(world_id,draft_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_drafts_promotion_week ON ppw_booking_drafts(world_id,promotion_id,year,week);
CREATE TABLE ppw_card_slots (
 world_id text NOT NULL, draft_id text NOT NULL, slot_id text NOT NULL,
 position integer NOT NULL CHECK(position >= 0),
 kind text NOT NULL CHECK(kind IN ('MATCH','SEGMENT')),
 payload jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(world_id,draft_id,slot_id),
 UNIQUE(world_id,draft_id,position),
 FOREIGN KEY(world_id,draft_id) REFERENCES ppw_booking_drafts(world_id,draft_id) ON DELETE CASCADE
);
CREATE TABLE ppw_command_receipts (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 request_id text NOT NULL, player_id text NOT NULL,
 command_type text NOT NULL, result jsonb NOT NULL,
 committed_revision bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(world_id,request_id)
);
CREATE TABLE ppw_ledger_events (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 event_id bigint GENERATED ALWAYS AS IDENTITY,
 year integer NOT NULL, week integer NOT NULL,
 event_type text NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(world_id,event_id)
);
CREATE INDEX ppw_ledger_recent ON ppw_ledger_events(world_id,event_id DESC);
CREATE TABLE ppw_player_home_projections (
 world_id text NOT NULL, player_id text NOT NULL,
 source_revision bigint NOT NULL, payload jsonb NOT NULL,
 PRIMARY KEY(world_id,player_id),
 FOREIGN KEY(world_id,player_id) REFERENCES ppw_memberships(world_id,player_id)
);
