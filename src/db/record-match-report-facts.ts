/** One bounded World-resolver write for complete, immutable match reporting.
 * Not an AI generated account: all facts come from the actual match simulation.
 */
import type {SqlRows} from "./world-operations.js";
import {recordVerifiedMedicalAbsencesInTransaction,type AcceptedMedicalInjury}
 from "./medical-availability.js";
import type {previewArchivedShowMatchScoresInTransaction}
 from "./legacy-match-scoring.js";
type Projection=Awaited<ReturnType<typeof previewArchivedShowMatchScoresInTransaction>>;
export interface RecordedMatchReportFact{
 matchId:string;ratingStars:number;executionQuality:number;actualMinutes:number;
 plannedMinutes?:number;
 chemistryModifier:number;finishCheaterPersonId:string|null;
 linkedProgrammes:number|null;programmeSignal:string|null;
 injuries:{personId:string;severity:string;weeksOut:number}[];
}
export function deriveCompletedMatchReportFacts(
 projection:Projection,
):RecordedMatchReportFact[]{
 if(projection.projections.length>100)throw new Error("Match report limit exceeded");
 const links=projection.showProgrammePreview==null?null:
  new Map(projection.showProgrammePreview.map(x=>[x.matchId,x]));
 if(links!==null&&links.size!==projection.projections.length)
  throw new Error("Incomplete certified programme context");
 return projection.projections.map(p=>{
  const score=p.score;
  const injuries=p.multi?.result.injuries??
   p.tag?.result.injury.injuries??p.injuryPreview?.injuries??[];
  if(!Number.isFinite(score.executionQuality)||
    score.executionQuality<0||score.executionQuality>100||
    !Number.isFinite(score.criticalRatingStars)||
    score.criticalRatingStars<0||score.criticalRatingStars>5||
    !Number.isSafeInteger(score.actualLengthMinutes)||
    score.actualLengthMinutes<3||score.actualLengthMinutes>120||
    injuries.length>30||
    !Number.isFinite(p.chemistryModifier)||Math.abs(p.chemistryModifier)>100||
    (p.finishCheaterId!==null&&
      (!p.personIds.includes(p.finishCheaterId)||
       !["DISQUALIFICATION","FOREIGN_OBJECT"].includes(p.plannedFinish))))

   throw new Error("Invalid verified match report facts");
  const verified=injuries.map(injury=>{
   if(!injury.personId||!["MINOR","MODERATE","MAJOR","SEVERE"].includes(injury.severity)||
    !Number.isSafeInteger(injury.weeksOut)||injury.weeksOut<1||
    injury.weeksOut>52)throw new Error("Invalid completed match injury detail");
   return {personId:injury.personId,severity:injury.severity,weeksOut:injury.weeksOut};
  });
  const storyline=links?.get(p.slotId)??null;
  if(links!==null&&(!storyline||
   !Number.isSafeInteger(storyline.linkedActiveProgrammeCount)||
   storyline.linkedActiveProgrammeCount<0||
   storyline.linkedActiveProgrammeCount>100))
   throw new Error("Invalid verified programme match context");
  // A medical stoppage or run-in may supersede the originally booked dirty
  // finish. Never attach the booked cheater to a different actual result.
  const actualFinish=p.multi?.result.actualFinish??
   p.tag?.result.final.actualFinish??p.interferencePreview?.actualFinish??
   p.plannedFinish;
  const recordedCheater=["DISQUALIFICATION","FOREIGN_OBJECT"].includes(actualFinish)?
   p.finishCheaterId:null;
  return {matchId:p.slotId,ratingStars:score.criticalRatingStars,
   executionQuality:score.executionQuality,
   chemistryModifier:p.chemistryModifier,
   finishCheaterPersonId:recordedCheater,
   actualMinutes:score.actualLengthMinutes,plannedMinutes:p.plannedMinutes,
   injuries:verified,
   linkedProgrammes:storyline?.linkedActiveProgrammeCount??null,
   programmeSignal:storyline?.reason??null};
 });
}
export async function recordCompletedMatchReportFactsInTransaction(
 tx:SqlRows,projection:Projection,
):Promise<AcceptedMedicalInjury[]>{
 const facts=deriveCompletedMatchReportFacts(projection);
 if(!facts.length)return [];
 const sql=[
  "INSERT INTO ppw_completed_match_report_facts(",
  "world_id,show_id,match_id,rating_stars,execution_quality,actual_minutes,",
  "chemistry_modifier,finish_cheater_person_id,linked_programmes,programme_signal,injuries_json)",
  "SELECT $1,$2,x.match_id,x.rating_stars,x.execution_quality,x.actual_minutes,",
  "x.chemistry_modifier,x.finish_cheater_person_id,",
  "x.linked_programmes,x.programme_signal,x.injuries_json",
  "FROM jsonb_to_recordset($3::jsonb) AS x(",
  "match_id text,rating_stars numeric,execution_quality numeric,actual_minutes integer,",
  "chemistry_modifier numeric,finish_cheater_person_id text,",
  "linked_programmes integer,programme_signal text,injuries_json jsonb)",
  "RETURNING match_id",
 ].join(" ");
 const rows=await tx.query<{match_id:string}>(sql,[
  projection.worldId,projection.showId,JSON.stringify(facts.map(f=>({
   match_id:f.matchId,rating_stars:f.ratingStars,execution_quality:f.executionQuality,
   actual_minutes:f.actualMinutes,chemistry_modifier:f.chemistryModifier,
   finish_cheater_person_id:f.finishCheaterPersonId,
   linked_programmes:f.linkedProgrammes,
   programme_signal:f.programmeSignal,
   injuries_json:f.injuries.map(x=>({person_id:x.personId,
    injury_severity:x.severity,injury_weeks_out:x.weeksOut})),
  }))),
 ]);
 if(rows.length!==facts.length||
   new Set(rows.map(x=>x.match_id)).size!==facts.length)
  throw new Error("Incomplete immutable match report insert");
 return recordVerifiedMedicalAbsencesInTransaction(tx,{
  worldId:projection.worldId,showId:projection.showId,
  year:projection.year,week:projection.week,facts
 });
}
