/** Trusted, additive career-source recovery for previously imported original
 * Genesis Worlds. NEVER reads or modifies original PPW; never resets a World,
 * manipulates bookings or manufactures missing historical match evidence.
 *
 * Earlier rebuild imports omitted original biological ages and aptitudes.
 * Recover the exact original immutable identity at the current game week;
 * preserve existing performance, titles, contracts, results and managers.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {projectOriginalGenesis,type OriginalGenesisSource}
 from "../domain/original-genesis-projection.js";

export async function recoverOriginalMainCareerBaselines(
 pool:TransactionPool,source:OriginalGenesisSource,
){
 const genesis=projectOriginalGenesis(source);
 if(genesis.world.id!=="world-"+genesis.world.seed||
   genesis.people.length!==643||genesis.promotions.length!==13||
   genesis.promotions.filter(p=>p.takeoverEligibility==="LOCKED").length!==8||
   genesis.people.some(p=>p.biologicalAge===null||
    p.careerExperience===null||p.developmentAptitude===null))
  throw new Error("Only a complete original-main 643-person Genesis can restore career baselines");
 return withWorldTransaction(pool,async tx=>{
  const clocks=await tx.query<{seed:string|number;ruleset_version:string;
   year:number;week:number;phase:string;show_economics_enabled:boolean;
   talent_population_target:number|null}>(`
   SELECT seed,ruleset_version,year,week,phase,show_economics_enabled,
    talent_population_target
   FROM ppw_worlds WHERE world_id=$1 FOR UPDATE`,[genesis.world.id]);
  const w=clocks[0];
  if(!w||clocks.length!==1||String(w.seed)!==String(genesis.world.seed)||
   w.ruleset_version!==genesis.world.rulesetVersion||
   !w.show_economics_enabled||w.phase!=="OPEN")
   throw new Error("An open, authenticated original-main rebuild World is required");
  const weekIndex=(w.year-1)*52+w.week-1;
  const historic=await tx.query<{person_id:string;name:string;
   biological_age:number|null;career_experience:number|null;
   development_aptitude:number|null;generated_talent:boolean}>(`
   SELECT person_id,name,biological_age,career_experience,
    development_aptitude,generated_talent
   FROM ppw_people
   WHERE world_id=$1 AND person_id=ANY($2::text[])
   ORDER BY person_id LIMIT 644`,
   [genesis.world.id,genesis.people.map(p=>p.id)]);
  const original=new Map(genesis.people.map(p=>[p.id,p]));
  if(historic.length!==genesis.people.length||
   historic.some(p=>p.name!==original.get(p.person_id)?.name||p.generated_talent))
   throw new Error("World does not match original-main wrestler identities");
  // Partially populated career baselines may indicate an interrupted or
  // separately amended database. Fail closed rather than overwrite.
  if(historic.some(p=>{
   const present=[p.biological_age,p.career_experience,p.development_aptitude]
    .filter(v=>v!==null).length;
   return present!==0&&present!==3;
  }))throw new Error("Partial original career baselines need manual reconciliation");
  const missing=historic.filter(p=>p.biological_age===null);
  const recovered=missing.map(p=>{
   const source=original.get(p.person_id)!;
   // Original formula: 1 real-world week = 1 PPW week, biological
   // ageing 0.14 years per 52 PPW weeks. No guessed career wins or ratings.
   const age=Math.round((source.biologicalAge!+
    weekIndex*.14/52)*1_000_000)/1_000_000;
   return {id:p.person_id,age,
    experience:source.careerExperience!,
    aptitude:source.developmentAptitude!};
  });
  if(recovered.length){
   const written=await tx.query<{person_id:string}>(`
    UPDATE ppw_people p SET biological_age=x.age,
     career_experience=x.experience,development_aptitude=x.aptitude
    FROM jsonb_to_recordset($2::jsonb) x(id text,age double precision,
     experience double precision,aptitude double precision)
    WHERE p.world_id=$1 AND p.person_id=x.id AND
     p.biological_age IS NULL AND p.career_experience IS NULL
     AND p.development_aptitude IS NULL
    RETURNING p.person_id`,[genesis.world.id,JSON.stringify(recovered)]);
   if(written.length!==recovered.length)
    throw new Error("Unsettled original career baseline: rollback");
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,$2,$3,'ORIGINAL_CAREER_BASELINES_RECOVERED',
     jsonb_build_object('restored', $4::integer,
      'originalPopulation',643,'historicWeeks', $5::integer,
      'pastSkillUpdates','not inferred'))`,
    [genesis.world.id,w.year,w.week,recovered.length,weekIndex]);
  }
  // The original 643-person Genesis was the population target; later
  // retirements or entirely new fictional wrestlers must never redefine it.
  if(w.talent_population_target===null||w.talent_population_target!==643){
   if(w.talent_population_target!==null&&w.talent_population_target!==643)
    throw new Error("Unverified existing talent population target");
   await tx.query(`
    UPDATE ppw_worlds SET talent_population_target=643
    WHERE world_id=$1 AND talent_population_target IS NULL`,[genesis.world.id]);
  }
  return {worldId:genesis.world.id,restored:recovered.length,
   alreadyPreserved:historic.length-recovered.length,
   originalPopulation:643,gameWeekIndex:weekIndex,
   historicalSkillsReconstructed:false};
 });
}
