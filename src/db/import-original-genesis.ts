/** Offline, trusted, one-shot Genesis bootstrap. The archived PPW game
 * produces the source in memory; this adapter stores ONLY normalized World,
 * wrestler, promotion, venue and contract rows, never world_state JSONB.
 *
 * No HTTP endpoint, scheduler, background worker or production migration.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {projectOriginalGenesis,type OriginalGenesisSource} from "../domain/original-genesis-projection.js";

export async function importOriginalGenesis(pool:TransactionPool,source:OriginalGenesisSource){
 // Verify the complete input BEFORE acquiring a PostgreSQL connection.
 const g=projectOriginalGenesis(source);
 return withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{world_id:string}>(`
   INSERT INTO ppw_worlds(world_id,name,seed,ruleset_version,
    year,week,day,phase,offer_acceptance_threshold,injury_rate_multiplier,
    show_economics_enabled,major_event_interval_weeks)
   VALUES($1,$2,$3,$4,1,1,1,'OPEN',$5,$6,true,$7) RETURNING world_id`,
   [g.world.id,g.world.name,g.world.seed,g.world.rulesetVersion,
    g.world.acceptance,g.world.injury,g.world.majorEventIntervalWeeks]);
  if(world.length!==1)throw new Error("Could not initialise fresh original World");
  // One narrow, batched insert per original Genesis entity family.
  // Market identity must exist before promotion homes and venue markets.
  const markets=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,
      wrestling_interest,spending_index)
    SELECT $1,x.id,x.name,x.audience_potential,x.wrestling_interest,x.spending_index
    FROM jsonb_to_recordset($2::jsonb) AS x(
      id text,name text,audience_potential double precision,
      wrestling_interest double precision,spending_index double precision)
    RETURNING market_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.markets.map(m=>({...m,
     audience_potential:m.audiencePotential,wrestling_interest:m.wrestlingInterest,
     spending_index:m.spendingIndex})))]);
  const promotions=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_promotions(world_id,promotion_id,name,home_market_id,tier,lifecycle,
     management_mode,cash,debt,media_reach,ai_financial_caution,
     ai_risk_tolerance,ai_match_quality_preference,ai_star_preference,
     takeover_eligibility,event_cadence_weeks,weekly_media_income,
     weekly_sponsor_income,weekly_fixed_overhead,last_weekly_net,financial_distress)
    SELECT $1,x.id,x.name,x.home_market_id,x.tier,x.lifecycle,x.mode,x.cash,x.debt,x.media,
     x.ai_financial_caution,x.ai_risk_tolerance,x.ai_match_quality_preference,
     x.ai_star_preference,x.takeover_eligibility,x.event_cadence_weeks,x.weekly_media,x.weekly_sponsor,x.weekly_overhead,x.last_net,x.distress
    FROM jsonb_to_recordset($2::jsonb) AS x(
     id text,name text,home_market_id text,tier text,lifecycle text,mode text,cash bigint,debt bigint,
     media double precision,ai_financial_caution double precision,
     ai_risk_tolerance double precision,ai_match_quality_preference double precision,
     ai_star_preference double precision,takeover_eligibility text,event_cadence_weeks integer,weekly_media bigint,weekly_sponsor bigint,
     weekly_overhead bigint,last_net bigint,distress text)
    RETURNING promotion_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.promotions.map(p=>({
    ...p,home_market_id:p.homeMarketId,
    ai_financial_caution:p.aiFinancialCaution,
    ai_risk_tolerance:p.aiRiskTolerance,
    ai_match_quality_preference:p.aiMatchQualityPreference,
    ai_star_preference:p.aiStarPreference,
    takeover_eligibility:p.takeoverEligibility,
    event_cadence_weeks:p.eventCadenceWeeks,
    weekly_media:p.weeklyMedia,weekly_sponsor:p.weeklySponsor,
    weekly_overhead:p.weeklyOverhead,last_net:p.lastWeeklyNet
   })))]);
  // Preserve the exact original standings in one normalized, bounded insert.
  const standings=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_promotion_standings(world_id,promotion_id,prestige,
     fan_reputation,business_reputation,talent_reputation,last_evaluated_year)
    SELECT $1,x.promotion_id,x.prestige,x.fan_reputation,
     x.business_reputation,x.talent_reputation,x.last_evaluated_year
    FROM jsonb_to_recordset($2::jsonb) AS x(
     promotion_id text,prestige double precision,fan_reputation double precision,
     business_reputation double precision,talent_reputation double precision,
     last_evaluated_year integer)
    RETURNING promotion_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.promotionStandings.map(s=>({
    promotion_id:s.promotionId,prestige:s.prestige,fan_reputation:s.fanReputation,
    business_reputation:s.businessReputation,talent_reputation:s.talentReputation,
    last_evaluated_year:s.lastEvaluatedYear})))]);
  // Original PPW starts with a singles and a tag belt for every live promotion.
  // An inaugural reign is never invented: the first title winner must be
  // established by the verified title-booking/resolution path.
  const titles=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_championships(
     world_id,promotion_id,championship_id,name,division,status,prestige)
    SELECT p.world_id,p.promotion_id,'founding:'||lower(d.division),
     p.name||CASE WHEN d.division='SINGLES' THEN ' World Championship'
      ELSE ' Tag Team Championship' END,
     d.division,CASE WHEN p.lifecycle='DORMANT' THEN 'INACTIVE' ELSE 'ACTIVE' END,
     CASE p.tier WHEN 'GLOBAL' THEN 72 WHEN 'NATIONAL' THEN 58
      WHEN 'RISING' THEN 45 WHEN 'INDEPENDENT' THEN 34 ELSE 25 END
    FROM ppw_promotions p CROSS JOIN (VALUES('SINGLES'),('TAG')) d(division)
    WHERE p.world_id=$1 AND p.lifecycle<>'CLOSED'
    RETURNING championship_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id]);
  const promotionMarkets=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_promotion_market_states(world_id,promotion_id,market_id,
      awareness,live_strength,loyalty)
    SELECT $1,x.promotion_id,x.market_id,x.awareness,x.live_strength,x.loyalty
    FROM jsonb_to_recordset($2::jsonb) AS x(
      promotion_id text,market_id text,awareness double precision,
      live_strength double precision,loyalty double precision)
    RETURNING market_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.promotionMarketStates.map(m=>({...m,
      promotion_id:m.promotionId,market_id:m.marketId,live_strength:m.liveStrength})))]);
  const people=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
     recognition,popularity,momentum,fatigue,wear,morale,in_ring_quality,
     match_craft,presentation,stamina,safety,contract_priorities,
     booking_division,default_alignment,portable_gimmick_id)
    SELECT $1,x.id,x.name,x.status,x.career_stage,x.recognition,x.popularity,
     x.momentum,x.fatigue,x.wear,x.morale,x.ring,x.craft,x.presentation,
     x.stamina,x.safety,x.priorities::jsonb,x.division,x.alignment,x.gimmick
    FROM jsonb_to_recordset($2::jsonb) AS x(
     id text,name text,status text,career_stage text,recognition double precision,
     popularity double precision,momentum double precision,fatigue double precision,
     wear double precision,morale double precision,ring smallint,craft smallint,
     presentation smallint,stamina smallint,safety smallint,priorities jsonb,
     division text,alignment text,gimmick text)
    RETURNING person_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.people.map(p=>({...p,career_stage:p.careerStage})))]);
  // The original-main factory seeds real tag identities and their exact
  // participants. Two bulk inserts preserve them; no inferred partnerships,
  // per-person round trips, or promotions owning duplicated team identities.
  const tagTeams=g.teams.length?await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    SELECT $1,x.id,x.name,x.status
    FROM jsonb_to_recordset($2::jsonb) AS x(
     id text,name text,status text)
    RETURNING team_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.teams)]):[{count:0}];
  const teamMembers=g.teamMemberships.length?await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active)
    SELECT $1,x.team_id,x.person_id,x.active
    FROM jsonb_to_recordset($2::jsonb) AS x(
     team_id text,person_id text,active boolean)
    RETURNING person_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.teamMemberships.map(m=>({
    team_id:m.teamId,person_id:m.personId,active:m.active
   })))]):[{count:0}];
  if(tagTeams[0]?.count!==g.teams.length||
   teamMembers[0]?.count!==g.teamMemberships.length)
   throw new Error("Incomplete original tag-team identities");
  const venues=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_venues(world_id,venue_id,name,market_id,status,capacity,weekly_hire_cost,
     prestige,production_suitability)
    SELECT $1,x.id,x.name,x.market_id,'ACTIVE',x.capacity,x.cost,x.prestige,x.suitability
    FROM jsonb_to_recordset($2::jsonb) AS x(id text,name text,
      market_id text,capacity integer,cost bigint,prestige double precision,suitability double precision)
    RETURNING venue_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.venues.map(v=>({...v,market_id:v.marketId})))])
  const contracts=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,
     remaining_dates,start_week_index,expires_week_index,date_entitlement,
     weekly_guarantee,appearance_fee,signing_bonus,role_expectation,creative_control)
    SELECT $1,x.id,x.person,x.promotion,x.family,x.status,x.remaining,
     x.start,x.expires,x.entitlement,x.weekly,x.appearance,x.bonus,x.role,x.creative
    FROM jsonb_to_recordset($2::jsonb) AS x(
     id text,person text,promotion text,family text,status text,remaining integer,
     start integer,expires integer,entitlement integer,weekly bigint,appearance bigint,
     bonus bigint,role text,creative text)
    RETURNING contract_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.contracts)]);
  if(markets[0]?.count!==g.markets.length||
    promotionMarkets[0]?.count!==g.promotionMarketStates.length||
    promotions[0]?.count!==g.promotions.length||standings[0]?.count!==g.promotionStandings.length||titles[0]?.count!==
     g.promotions.filter(p=>p.lifecycle!=='CLOSED').length*2||people[0]?.count!==g.people.length
   ||venues[0]?.count!==g.venues.length||contracts[0]?.count!==g.contracts.length)
   throw new Error("Incomplete relational Genesis import");
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,1,1,'WORLD_GENESIS_IMPORTED',jsonb_build_object(
     'promotions',$2::integer,'wrestlers',$3::integer,'venues',$4::integer,
     'contracts',$5::integer,'ruleset',$6::text))`,
   [g.world.id,g.promotions.length,g.people.length,g.venues.length,
    g.contracts.length,g.world.rulesetVersion]);
  return {worldId:g.world.id,promotions:g.promotions.length,people:g.people.length,
   venues:g.venues.length,contracts:g.contracts.length,
   markets:g.markets.length,promotionMarketStates:g.promotionMarketStates.length,
   championships:titles[0]!.count,standings:standings[0]!.count,
   tagTeams:g.teams.length,
   teamMembers:g.teamMemberships.length,
   sqlStatements:10+Number(g.teams.length>0)+Number(g.teamMemberships.length>0)};
 });
}
