/** One bounded transactionally recorded rumour arc per certified World week.
 * No private booking, morale, message or contract reads. All incidents here are
 * fictional editorial colour and have no hidden gameplay consequences. */
import type {SqlRows} from "./world-operations.js";
import type {WorldNewsStory} from "./world-news.js";
import {rumourCaseVeracity,rumourFollowup,type RumourCase} from "../domain/wrestling-rumour-cases.js";
export async function continueWorldRumours(tx:SqlRows,worldId:string,year:number,
 week:number,stories:readonly WorldNewsStory[]):Promise<WorldNewsStory[]>{
 const index=(year-1)*52+week-1;
 const old=await tx.query<RumourCase>(`
  SELECT case_key,origin_week_index,last_followup_week_index,chapter,veracity,
   promotion_id,promotion_name,show_id,headline FROM ppw_world_rumour_cases
  WHERE world_id=$1 AND chapter<2 AND origin_week_index<$2
   AND (last_followup_week_index IS NULL OR last_followup_week_index<=$2-2)
  ORDER BY origin_week_index DESC LIMIT 1`,[worldId,index]);
 if(old.length)await tx.query(`
  UPDATE ppw_world_rumour_cases SET chapter=chapter+1,last_followup_week_index=$3
  WHERE world_id=$1 AND case_key=$2 AND chapter=$4`,
  [worldId,old[0]!.case_key,index,old[0]!.chapter]);
 const next=stories.find(s=>s.desk==="DIRT");
 if(next)await tx.query(`
  INSERT INTO ppw_world_rumour_cases(
   world_id,case_key,origin_week_index,chapter,veracity,promotion_id,
   promotion_name,show_id,headline)
  VALUES($1,$2,$3,0,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING`,
  [worldId,next.key,index,rumourCaseVeracity(worldId+":"+next.key),
   next.promotionId,next.promotionName,next.showId,next.title]);
 return old.map(x=>rumourFollowup(x,year,week));
}
