-- Original show economics are World-scoped, relational and opt-in for
-- imported Genesis Worlds. Existing dev fixtures retain their original flow.
ALTER TABLE ppw_worlds
 ADD COLUMN show_economics_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE ppw_markets (
 world_id text NOT NULL REFERENCES ppw_worlds(world_id),
 market_id text NOT NULL, name text NOT NULL,
 audience_potential double precision NOT NULL CHECK(audience_potential BETWEEN 0 AND 100),
 wrestling_interest double precision NOT NULL CHECK(wrestling_interest BETWEEN 0 AND 100),
 spending_index double precision NOT NULL CHECK(spending_index BETWEEN 0 AND 1000),
 PRIMARY KEY(world_id,market_id)
);
ALTER TABLE ppw_promotions ADD COLUMN home_market_id text;
ALTER TABLE ppw_promotions ADD CONSTRAINT ppw_promotion_home_market
 FOREIGN KEY(world_id,home_market_id) REFERENCES ppw_markets(world_id,market_id);
ALTER TABLE ppw_venues ADD COLUMN market_id text;
ALTER TABLE ppw_venues ADD CONSTRAINT ppw_venue_market
 FOREIGN KEY(world_id,market_id) REFERENCES ppw_markets(world_id,market_id);
CREATE TABLE ppw_promotion_market_states (
 world_id text NOT NULL,
 promotion_id text NOT NULL, market_id text NOT NULL,
 awareness double precision NOT NULL CHECK(awareness BETWEEN 0 AND 100),
 live_strength double precision NOT NULL CHECK(live_strength BETWEEN 0 AND 100),
 loyalty double precision NOT NULL CHECK(loyalty BETWEEN 0 AND 100),
 PRIMARY KEY(world_id,promotion_id,market_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id),
 FOREIGN KEY(world_id,market_id) REFERENCES ppw_markets(world_id,market_id)
);
ALTER TABLE ppw_booking_drafts
 ADD COLUMN market_id text,
 ADD COLUMN event_type text CHECK(event_type IN ('REGULAR','MAJOR')),
 ADD COLUMN ticket_strategy text CHECK(ticket_strategy IN ('ACCESSIBLE','STANDARD','PREMIUM','PRESTIGE'));
ALTER TABLE ppw_booking_drafts ADD CONSTRAINT ppw_booked_show_market
 FOREIGN KEY(world_id,market_id) REFERENCES ppw_markets(world_id,market_id);
CREATE TABLE ppw_show_economics(
 world_id text NOT NULL,
 show_id text NOT NULL,
 promotion_id text NOT NULL,
 year integer NOT NULL,week integer NOT NULL,
 attendance integer NOT NULL CHECK(attendance>=0),
 expected_demand integer NOT NULL CHECK(expected_demand>=100),
 gate_revenue bigint NOT NULL CHECK(gate_revenue>=0),
 venue_cost bigint NOT NULL CHECK(venue_cost>=0),
 production_cost bigint NOT NULL CHECK(production_cost>=0),
 travel_cost bigint NOT NULL CHECK(travel_cost>=0),
 appearance_fees bigint NOT NULL CHECK(appearance_fees>=0),
 total_cost bigint NOT NULL CHECK(total_cost>=0),
 net_result bigint NOT NULL,
 incremental_cash bigint NOT NULL,
 PRIMARY KEY(world_id,show_id),
 FOREIGN KEY(world_id,show_id) REFERENCES ppw_completed_shows(world_id,show_id),
 FOREIGN KEY(world_id,promotion_id) REFERENCES ppw_promotions(world_id,promotion_id)
);
CREATE INDEX ppw_show_economics_week
 ON ppw_show_economics(world_id,year,week,promotion_id);
-- Finance rollup remains limited to THIS World/week, including real shows.
DROP INDEX ppw_ledger_week_finance;
CREATE INDEX ppw_ledger_week_finance
 ON ppw_ledger_events(world_id,year,week,event_type)
 WHERE event_type IN ('CONTRACT_SIGNED','CONTRACT_EXTRA_DATES_ACCEPTED',
  'CONTRACT_APPEARANCE_FEES','CONTRACT_GUARANTEE_PAID',
  'PROMOTION_RECURRING_FINANCES','SHOW_EVENT_ECONOMICS');
