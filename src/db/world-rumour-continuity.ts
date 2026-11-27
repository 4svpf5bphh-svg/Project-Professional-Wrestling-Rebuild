/** One bounded transactionally recorded rumour arc per certified World week.
 * No private booking, morale, message or contract reads. All incidents here are
 * fictional editorial colour and have no hidden gameplay consequences. */
import type {SqlRows} from "./world-operations.js";
import type {WorldNewsStory} from "./world-news.js";
import {canFollowRumour,publicRumourDevelopment,rumourCaseVeracity,rumourFollowup,type RumourCase} from "../domain/wrestling-rumour-cases.js";
export async function continueWorldRumours(tx:SqlRows,worldId:string,year:number,
 week:number,stories:readonly WorldNewsStory[]):Promise<WorldNewsStory[]>{
 const index=(year-1)*52+week-1;
 const hasPublicDevelopment=stories.some(s=>s.desk==="OFFICIAL"&&["TITLE","ANGLE","MATCH"].includes(s.sourceKind));
 const old=hasPublicDevelopment?await tx.query<RumourCase>(`
  SELECT case_key,origin_week_index,last_followup_week_index,chapter,veracity,
   promotion_id,promotion_name,show_id,headline FROM ppw_world_rumour_cases
  WHERE world_id=$1 AND chapter<2 AND origin_week_index BETWEEN $2-6 AND $2-1
   AND (last_followup_week_index IS NULL OR last_followup_week_index<=$2-2)
  ORDER BY origin_week_index DESC,case_key LIMIT 12`,[worldId,index]):[];
 const development=old.flatMap(c=>{
  const evidence=publicRumourDevelopment(c,stories);
  return evidence?[{c,evidence}]:[];
 })[0];
 if(development)await tx.query(`
  UPDATE ppw_world_rumour_cases SET chapter=chapter+1,last_followup_week_index=$3
  WHERE world_id=$1 AND case_key=$2 AND chapter=$4`,
  [worldId,development.c.case_key,index,development.c.chapter]);
 const next=stories.find(s=>s.desk==="DIRT"&&canFollowRumour(s.key));
 if(next)await tx.query(`
  INSERT INTO ppw_world_rumour_cases(
   world_id,case_key,origin_week_index,chapter,veracity,promotion_id,
   promotion_name,show_id,headline)
  VALUES($1,$2,$3,0,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
  [worldId,next.key,index,rumourCaseVeracity(worldId+":"+next.key),
   next.promotionId,next.promotionName,next.showId,next.title]);
 return development?[rumourFollowup(development.c,year,week,development.evidence)]:[];
}
