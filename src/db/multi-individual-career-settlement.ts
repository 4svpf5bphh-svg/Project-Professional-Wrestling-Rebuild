/** Canonical 3/4 person career mutations are made only AFTER three/four distinct are proved by the verified completed show in the same World
 * transaction. The UPDATE and history INSERT each operate on bounded arrays.
 * If any row is missing or its scored baseline changed, throw and roll back
 * the completed show, contracts and title mutations together.
 */
import type {SqlRows} from "./world-operations.js";
import type {previewArchivedShowMatchScoresInTransaction}
 from "./legacy-match-scoring.js";
type Projection=Awaited<ReturnType<typeof previewArchivedShowMatchScoresInTransaction>>;
export async function settleMultiIndividualCareerConsequences(
 tx:SqlRows,projection:Projection,
):Promise<{performers:number;matches:number;injuries:number}>{
 const effects=projection.projections.flatMap(p=>p.multi?
  p.multi.result.members.map(member=>({
   show_id:projection.showId,match_id:p.slotId,person_id:member.personId,
   actual_winner_side:p.multi!.result.actualWinnerSide,
   performer_side:member.sideId,won:member.won,
   before_stats:member.before,after_stats:member.after,
   injury_severity:member.injury?.severity??null,
   injury_weeks_out:member.injury?.weeksOut??null,
  })):[]);
 const matchCount=projection.projections.filter(p=>p.multi!==null).length;
 if(!effects.length)return {performers:0,matches:0,injuries:0};
 if(effects.length>100||matchCount>100||
   new Set(effects.map(e=>e.person_id)).size!==effects.length||
   !Number.isInteger(effects.length/matchCount)||
   effects.length<matchCount*3||effects.length>matchCount*4)
  throw new Error("Multi-person career batch exceeds bounded unique performer capacity");
 const values=effects.map(e=>({
  person_id:e.person_id,
  ...Object.fromEntries((["fatigue","wear","momentum","recognition",
   "popularity"] as const).flatMap(k=>[
    ["before_"+k,e.before_stats[k]],["after_"+k,e.after_stats[k]]])),
 }));
 // Only the exact scored wrestler versions can be advanced. No silent
 // over-writing another promotion's intervening week consequences.
 const updated=await tx.query<{person_id:string}>(`
 UPDATE ppw_people p SET
   fatigue=x.after_fatigue,wear=x.after_wear,
   momentum=x.after_momentum,recognition=x.after_recognition,
   popularity=x.after_popularity
 FROM jsonb_to_recordset($2::jsonb) AS x(
  person_id text,before_fatigue double precision,after_fatigue double precision,
  before_wear double precision,after_wear double precision,
  before_momentum double precision,after_momentum double precision,
  before_recognition double precision,after_recognition double precision,
  before_popularity double precision,after_popularity double precision)
 WHERE p.world_id=$1 AND p.person_id=x.person_id AND p.status='ACTIVE'
   AND p.fatigue=x.before_fatigue AND p.wear=x.before_wear
   AND p.momentum=x.before_momentum
   AND p.recognition=x.before_recognition AND p.popularity=x.before_popularity
 RETURNING p.person_id`,[projection.worldId,JSON.stringify(values)]);
 if(updated.length!==effects.length)
  throw new Error("Scored multi-person wrestler baseline changed or missing");
 const recorded=await tx.query<{person_id:string}>(`
  INSERT INTO ppw_individual_field_career_effects(
   world_id,show_id,match_id,person_id,actual_winner_side,
   performer_side,won,before_stats,after_stats,injury_severity,injury_weeks_out)
  SELECT $1,x.show_id,x.match_id,x.person_id,x.actual_winner_side,
   x.performer_side,x.won,x.before_stats,x.after_stats,
   x.injury_severity,x.injury_weeks_out
  FROM jsonb_to_recordset($2::jsonb) AS x(
    show_id text,match_id text,person_id text,
    actual_winner_side text,performer_side text,won boolean,
    before_stats jsonb,after_stats jsonb,
    injury_severity text,injury_weeks_out integer)
  RETURNING person_id`,[projection.worldId,JSON.stringify(effects)]);
 if(recorded.length!==effects.length)
  throw new Error("Incomplete multi-person wrestler career receipts");
 return {performers:effects.length,matches:matchCount,
  injuries:effects.filter(e=>e.injury_severity!==null).length};
}
