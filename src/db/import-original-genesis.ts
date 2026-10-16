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
    year,week,day,phase,offer_acceptance_threshold,injury_rate_multiplier)
   VALUES($1,$2,$3,$4,1,1,1,'OPEN',$5,$6) RETURNING world_id`,
   [g.world.id,g.world.name,g.world.seed,g.world.rulesetVersion,
    g.world.acceptance,g.world.injury]);
  if(world.length!==1)throw new Error("Could not initialise fresh original World");
  // All four sets use one PostgreSQL command apiece, independent of 600+
  // person rows. The returned result is a scalar count, NEVER the roster.
  const promotions=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_promotions(world_id,promotion_id,name,tier,lifecycle,
     management_mode,cash,debt,media_reach,weekly_media_income,
     weekly_sponsor_income,weekly_fixed_overhead,last_weekly_net,financial_distress)
    SELECT $1,x.id,x.name,x.tier,x.lifecycle,x.mode,x.cash,x.debt,x.media,
     x.weekly_media,x.weekly_sponsor,x.weekly_overhead,x.last_net,x.distress
    FROM jsonb_to_recordset($2::jsonb) AS x(
     id text,name text,tier text,lifecycle text,mode text,cash bigint,debt bigint,
     media double precision,weekly_media bigint,weekly_sponsor bigint,
     weekly_overhead bigint,last_net bigint,distress text)
    RETURNING promotion_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.promotions.map(p=>({
    ...p,weekly_media:p.weeklyMedia,weekly_sponsor:p.weeklySponsor,
    weekly_overhead:p.weeklyOverhead,last_net:p.lastWeeklyNet
   })))]);
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
  const venues=await tx.query<{count:number}>(`
   WITH inserted AS (
    INSERT INTO ppw_venues(world_id,venue_id,name,status,capacity,weekly_hire_cost,
     prestige,production_suitability)
    SELECT $1,x.id,x.name,'ACTIVE',x.capacity,x.cost,x.prestige,x.suitability
    FROM jsonb_to_recordset($2::jsonb) AS x(id text,name text,
      capacity integer,cost bigint,prestige double precision,suitability double precision)
    RETURNING venue_id
   ) SELECT count(*)::integer AS count FROM inserted`,
   [g.world.id,JSON.stringify(g.venues)]);
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
  if(promotions[0]?.count!==g.promotions.length||people[0]?.count!==g.people.length
   ||venues[0]?.count!==g.venues.length||contracts[0]?.count!==g.contracts.length)
   throw new Error("Incomplete relational Genesis import");
  await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,1,1,'WORLD_GENESIS_IMPORTED',jsonb_build_object(
     'promotions',$2::integer,'wrestlers',$3::integer,'venues',$4::integer,
     'contracts',$5::integer,'ruleset',$6::text))`,
   [g.world.id,g.promotions.length,g.people.length,g.venues.length,
    g.contracts.length,g.world.rulesetVersion]);
  return {worldId:g.world.id,promotions:g.promotions.length,people:g.people.length,
   venues:g.venues.length,contracts:g.contracts.length,sqlStatements:6};
 });
}
