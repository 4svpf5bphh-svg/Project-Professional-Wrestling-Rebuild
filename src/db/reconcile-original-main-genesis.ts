/** One-shot, additive recovery of an older Week-1 rebuild World from a
 * verified fresh original-main export. Never imports guessed gimmicks or teams,
 * discards ownership, changes bookings, or creates a parallel World.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {projectOriginalGenesis,type OriginalGenesisSource}
 from "../domain/original-genesis-projection.js";

export async function reconcileOriginalMainGenesis(
 pool:TransactionPool,source:OriginalGenesisSource,
){
 // Source provenance is validated by the original-main exporter and the
 // operator's exact repository check; the adapter verifies its full shape.
 const g=projectOriginalGenesis(source);
 if(g.world.id!=="world-"+g.world.seed||g.promotions.length!==13||
  g.people.length!==643||g.personas.length!==643||
  g.teams.length<10||g.teamMemberships.length<20||
  g.rosterAffiliations.length<50||
  g.promotions.filter(p=>p.takeoverEligibility==="LOCKED").length!==8||
  g.promotions.filter(p=>p.takeoverEligibility==="STANDARD").length!==5)
  throw new Error("Only complete genuine original-main 13-promotion Genesis can repair a rebuild");
 return withWorldTransaction(pool,async tx=>{
  const clock=await tx.query<{
   world_id:string;seed:string|number;ruleset_version:string;
   year:number;week:number;phase:string;
  }>(`SELECT world_id,seed,ruleset_version,year,week,phase FROM ppw_worlds
   WHERE world_id=$1 FOR UPDATE`,[g.world.id]);
  const w=clock[0];
  if(!w||clock.length!==1||String(w.seed)!==String(g.world.seed)||
   w.ruleset_version!==g.world.rulesetVersion||
   w.year!==1||w.week!==1||w.phase!=="OPEN")
   throw new Error("Only the exact matching untouched Week-1 rebuild World may be reconciled");

  // A receipt in an old database does not certify complete Genesis content.
  // Match the actual wrestler names/IDs and promotion IDs rather than assuming
  // a same-sized roster is the same original-main source.
  const counts=await tx.query<{
   people:number;promotions:number;persona:number;teams:number;
   members:number;standings:number;affiliations:number;receipts:number;
   missing_people:number;missing_promotions:number;gimmicks:number;parents:number;
  }>(`
   SELECT
    (SELECT count(*)::integer FROM ppw_people WHERE world_id=$1) AS people,
    (SELECT count(*)::integer FROM ppw_promotions WHERE world_id=$1) AS promotions,
    (SELECT count(*)::integer FROM ppw_portable_personas WHERE world_id=$1) AS persona,
    (SELECT count(*)::integer FROM ppw_tag_teams WHERE world_id=$1) AS teams,
    (SELECT count(*)::integer FROM ppw_tag_team_members WHERE world_id=$1) AS members,
    (SELECT count(*)::integer FROM ppw_promotion_standings WHERE world_id=$1) AS standings,
    (SELECT count(*)::integer FROM ppw_wrestler_promotion_affiliations WHERE world_id=$1) AS affiliations,
    (SELECT count(*)::integer FROM ppw_ledger_events
     WHERE world_id=$1 AND event_type='WORLD_GENESIS_IMPORTED') AS receipts,
    (SELECT count(*)::integer FROM jsonb_to_recordset($2::jsonb) src(id text,name text)
     LEFT JOIN ppw_people p ON p.world_id=$1 AND p.person_id=src.id AND p.name=src.name
     WHERE p.person_id IS NULL) AS missing_people,
    (SELECT count(*)::integer FROM jsonb_to_recordset($3::jsonb) src(id text)
     LEFT JOIN ppw_promotions p ON p.world_id=$1 AND p.promotion_id=src.id
     WHERE p.promotion_id IS NULL) AS missing_promotions,
    (SELECT count(*)::integer FROM ppw_people
     WHERE world_id=$1 AND portable_gimmick_id IS NOT NULL) AS gimmicks,
    (SELECT count(*)::integer FROM ppw_promotions
     WHERE world_id=$1 AND parent_promotion_id IS NOT NULL) AS parents
  `,[g.world.id,JSON.stringify(g.people.map(p=>({id:p.id,name:p.name}))),
    JSON.stringify(g.promotions.map(p=>({id:p.id})))]);
  const c=counts[0];
  if(!c||c.people!==643||c.promotions!==13||
   c.missing_people!==0||c.missing_promotions!==0||c.receipts!==1||
   c.persona!==0||c.teams!==0||c.members!==0||c.standings!==0||
   c.affiliations!==0||c.gimmicks!==0||c.parents!==0)
   throw new Error("Rebuild World has changed or already contains Genesis identities; refusing partial overwrite");

  const inserted=async(sql:string,rows:unknown[],expected:number,label:string)=>{
   const out=await tx.query<{count:number}>(sql,rows);
   if(out[0]?.count!==expected)throw new Error("Incomplete original "+label+" recovery");
  };
  await inserted(`
   WITH updated AS (
    UPDATE ppw_people p SET portable_gimmick_id=x.gimmick
    FROM jsonb_to_recordset($2::jsonb) x(id text,gimmick text)
    WHERE p.world_id=$1 AND p.person_id=x.id AND p.portable_gimmick_id IS NULL
    RETURNING p.person_id
   ) SELECT count(*)::integer AS count FROM updated
  `,[g.world.id,JSON.stringify(g.people.map(p=>({id:p.id,gimmick:p.gimmick})))],
  g.people.length,"wrestler gimmick IDs");
  await inserted(`
   WITH inserted AS (
    INSERT INTO ppw_portable_personas(world_id,person_id,revision,persona,
     provenance,introduced_week_index)
    SELECT $1,x.person_id,1,x.persona,x.provenance,0
    FROM jsonb_to_recordset($2::jsonb)
     x(person_id text,persona jsonb,provenance text)
    RETURNING person_id
   ) SELECT count(*)::integer AS count FROM inserted
  `,[g.world.id,JSON.stringify(g.personas.map(x=>({
   person_id:x.personId,persona:x.persona,provenance:x.persona.source
  })))],g.personas.length,"wrestler personas");
  await inserted(`
   WITH inserted AS (
    INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    SELECT $1,x.id,x.name,x.status
    FROM jsonb_to_recordset($2::jsonb) x(id text,name text,status text)
    RETURNING team_id
   ) SELECT count(*)::integer AS count FROM inserted
  `,[g.world.id,JSON.stringify(g.teams)],g.teams.length,"tag teams");
  await inserted(`
   WITH inserted AS (
    INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active)
    SELECT $1,x.team_id,x.person_id,x.active
    FROM jsonb_to_recordset($2::jsonb)
      x(team_id text,person_id text,active boolean)
    RETURNING person_id
   ) SELECT count(*)::integer AS count FROM inserted
  `,[g.world.id,JSON.stringify(g.teamMemberships.map(x=>({
    team_id:x.teamId,person_id:x.personId,active:x.active
  })))],g.teamMemberships.length,"team members");
  await inserted(`
   WITH inserted AS (
    INSERT INTO ppw_promotion_standings(world_id,promotion_id,prestige,
     fan_reputation,business_reputation,talent_reputation,last_evaluated_year)
    SELECT $1,x.promotion_id,x.prestige,x.fan_reputation,x.business_reputation,
     x.talent_reputation,x.last_evaluated_year
    FROM jsonb_to_recordset($2::jsonb) x(
     promotion_id text,prestige double precision,fan_reputation double precision,
     business_reputation double precision,talent_reputation double precision,
     last_evaluated_year integer)
    RETURNING promotion_id
   ) SELECT count(*)::integer AS count FROM inserted
  `,[g.world.id,JSON.stringify(g.promotionStandings.map(x=>({
   promotion_id:x.promotionId,prestige:x.prestige,
   fan_reputation:x.fanReputation,business_reputation:x.businessReputation,
   talent_reputation:x.talentReputation,last_evaluated_year:x.lastEvaluatedYear
  })))],g.promotionStandings.length,"promotion standings");
  const parents=g.promotions.filter(x=>x.parentPromotionId!==null);
  await inserted(`
   WITH updated AS (
    UPDATE ppw_promotions p SET parent_promotion_id=x.parent_id
    FROM jsonb_to_recordset($2::jsonb) x(id text,parent_id text)
    WHERE p.world_id=$1 AND p.promotion_id=x.id AND p.parent_promotion_id IS NULL
    RETURNING p.promotion_id
   ) SELECT count(*)::integer AS count FROM updated
  `,[g.world.id,JSON.stringify(parents.map(x=>({
   id:x.id,parent_id:x.parentPromotionId
  })))],parents.length,"parent promotion lineage");
  await inserted(`
   WITH inserted AS (
    INSERT INTO ppw_wrestler_promotion_affiliations(
     world_id,person_id,promotion_id,role,basis)
    SELECT $1,x.person_id,x.promotion_id,x.role,x.basis
    FROM jsonb_to_recordset($2::jsonb)
     x(person_id text,promotion_id text,role text,basis text)
    RETURNING person_id
   ) SELECT count(*)::integer AS count FROM inserted
  `,[g.world.id,JSON.stringify(g.rosterAffiliations.map(x=>({
   person_id:x.personId,promotion_id:x.promotionId,role:x.role,basis:x.basis
  })))],g.rosterAffiliations.length,"original affiliation rosters");
  return {worldId:g.world.id,repairedPersonas:g.personas.length,
   repairedTeams:g.teams.length,repairedTeamMembers:g.teamMemberships.length,
   repairedStandings:g.promotionStandings.length,
   repairedAffiliations:g.rosterAffiliations.length,
   restoredParentPromotions:parents.length};
 });
}
