-- Account-owned Kayfabe Points are separate from promotion money and simulation.
-- Never grant wrestlers, contracts or rating modifiers for cosmetic spending.
CREATE TABLE ppw_kp_wallets(
 player_id text PRIMARY KEY REFERENCES ppw_players(player_id),
 balance bigint NOT NULL DEFAULT 0 CHECK(balance BETWEEN 0 AND 1000000000),
 lifetime_earned bigint NOT NULL DEFAULT 0 CHECK(lifetime_earned BETWEEN 0 AND 1000000000),
 lifetime_spent bigint NOT NULL DEFAULT 0 CHECK(lifetime_spent BETWEEN 0 AND 1000000000)
);
-- Each published, played World week can pay once, and at most once per UTC day
-- across all Worlds. These are durable, not computed from login frequency.
CREATE TABLE ppw_kp_week_grants(
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 year integer NOT NULL CHECK(year>0),
 week integer NOT NULL CHECK(week BETWEEN 1 AND 52),
 credited_on date NOT NULL DEFAULT (timezone('utc',now())::date),
 amount integer NOT NULL CHECK(amount BETWEEN 1 AND 100),
 PRIMARY KEY(player_id,world_id,year,week),
 UNIQUE(player_id,credited_on),
 FOREIGN KEY(world_id,year,week) REFERENCES ppw_world_news_weeks(world_id,year,week)
);
CREATE TABLE ppw_kp_receipts(
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 request_id text NOT NULL CHECK(length(request_id) BETWEEN 1 AND 200),
 kind text NOT NULL CHECK(kind IN ('BUY','APPLY_BRAND','APPLY_BADGE','RENAME_STAFF','CREATE_WRESTLER')),
 payload_hash text NOT NULL CHECK(length(payload_hash)=64),
 outcome jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(player_id,request_id)
);
CREATE TABLE ppw_kp_entitlements(
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 70),
 purchased_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(player_id,sku)
);
CREATE TABLE ppw_kp_promotion_styles(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 style text NOT NULL CHECK(style IN ('CHROME','NEON','GOLD')),
 PRIMARY KEY(world_id,promotion_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE TABLE ppw_kp_badge_styles(
 player_id text PRIMARY KEY REFERENCES ppw_players(player_id),
 style text NOT NULL CHECK(style IN ('GOLD','PLATINUM'))
);
CREATE TABLE ppw_kp_staff_aliases(
 world_id text NOT NULL,
 promotion_id text NOT NULL,
 staff_id text NOT NULL,
 player_id text NOT NULL REFERENCES ppw_players(player_id),
 alias text NOT NULL CHECK(length(btrim(alias)) BETWEEN 3 AND 48),
 PRIMARY KEY(world_id,promotion_id,staff_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE TABLE ppw_kp_created_talent(
 world_id text NOT NULL,
 person_id text NOT NULL,
 creator_player_id text NOT NULL REFERENCES ppw_players(player_id),
 created_year integer NOT NULL CHECK(created_year>0),
 PRIMARY KEY(world_id,person_id),
 UNIQUE(world_id,creator_player_id,created_year),
 FOREIGN KEY(world_id,person_id) REFERENCES ppw_people(world_id,person_id)
);
CREATE INDEX ppw_kp_created_talent_creator ON ppw_kp_created_talent(creator_player_id,world_id);
