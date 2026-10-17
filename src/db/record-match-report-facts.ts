/** One bounded World-resolver write for complete, immutable match reporting.
 * Not an AI generated account: all facts come from the actual match simulation.
 */
import type {SqlRows} from "./world-operations.js";
import type {previewArchivedShowMatchScoresInTransaction}
 from "./legacy-match-scoring.js";
type Projection=Awaited<ReturnType<typeof previewArchivedShowMatchScoresInTransaction>>;
export interface RecordedMatchReportFact{
 matchId:string;ratingStars:number;actualMinutes:number;
 injuries:{personId:string;severity:string;weeksOut:number}[];
}
export function deriveCompletedMatchReportFacts(
 projection:Projection,
):RecordedMatchReportFact[]{
 if(projection.projections.length>100)throw new Error("Match report limit exceeded");
 return projection.projections.map(p=>{
  const score=p.score;
  const injuries=p.multi?.result.injuries??
   p.tag?.result.injury.injuries??p.injuryPreview?.injuries??[];
  if(!Number.isFinite(score.criticalRatingStars)||
    score.criticalRatingStars<0||score.criticalRatingStars>5||
    !Number.isSafeInteger(score.actualLengthMinutes)||
    score.actualLengthMinutes<3||score.actualLengthMinutes>120||
    injuries.length>30)
   throw new Error("Invalid verified match report facts");
  const verified=injuries.map(injury=>{
   if(!injury.personId||!["MINOR","MODERATE","MAJOR","SEVERE"].includes(injury.severity)||
    !Number.isSafeInteger(injury.weeksOut)||injury.weeksOut<1||
    injury.weeksOut>52)throw new Error("Invalid completed match injury detail");
   return {personId:injury.personId,severity:injury.severity,weeksOut:injury.weeksOut};
  });
  return {matchId:p.slotId,ratingStars:score.criticalRatingStars,
   actualMinutes:score.actualLengthMinutes,injuries:verified};
 });
}
export async function recordCompletedMatchReportFactsInTransaction(
 tx:SqlRows,projection:Projection,
):Promise<void>{
 const facts=deriveCompletedMatchReportFacts(projection);
 if(!facts.length)return;
 const sql=[
  "INSERT INTO ppw_completed_match_report_facts(",
  "world_id,show_id,match_id,rating_stars,actual_minutes,injuries_json)",
  "SELECT $1,$2,x.match_id,x.rating_stars,x.actual_minutes,x.injuries_json",
  "FROM jsonb_to_recordset($3::jsonb) AS x(",
  "match_id text,rating_stars numeric,actual_minutes integer,injuries_json jsonb)",
  "RETURNING match_id",
 ].join(" ");
 const rows=await tx.query<{match_id:string}>(sql,[
  projection.worldId,projection.showId,JSON.stringify(facts.map(f=>({
   match_id:f.matchId,rating_stars:f.ratingStars,actual_minutes:f.actualMinutes,
   injuries_json:f.injuries.map(x=>({person_id:x.personId,
    injury_severity:x.severity,injury_weeks_out:x.weeksOut})),
  }))),
 ]);
 if(rows.length!==facts.length||
   new Set(rows.map(x=>x.match_id)).size!==facts.length)
  throw new Error("Incomplete immutable match report insert");
}
