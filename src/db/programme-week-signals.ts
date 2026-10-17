/** Recompute active storyline signals once after every certified World week.
 * Exactly the archived 10/8/6-week recency calculation, never a constant
 * decrement or new random outcome. No full WorldState hydration or N+1 reads.
 */
import type {SqlRows} from "./world-operations.js";
import {evaluateProgrammeSignals} from "../domain/programme-signals.js";
export async function refreshWorldProgrammeSignals(
 tx:SqlRows,worldId:string,currentWeekIndex:number,
):Promise<{examined:number;changed:number}>{
 if(!worldId||worldId.length>200||
  !Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0)
  throw new Error("Invalid programme World week");
 const active=await tx.query<{promotion_id:string;programme_id:string;
  heat:number|null;repetition:number}>([
  "SELECT promotion_id,programme_id,heat,repetition FROM ppw_programmes",
  "WHERE world_id=$1 AND status='ACTIVE'",
  "ORDER BY promotion_id,programme_id LIMIT 513"
 ].join(" "),[worldId]);
 if(active.length>512)throw new Error("Too many active World programmes");
 if(!active.length)return {examined:0,changed:0};
 // Query only 10 weeks of completed event facts and active programmes.
 // The indexed programme/week keys avoid loading all historical storylines.
 const recent=await tx.query<{promotion_id:string;programme_id:string;
  week_index:number;signature:string;impact:number}>([
  "SELECT a.promotion_id,a.programme_id,a.week_index,a.signature,a.impact",
  "FROM ppw_programme_resolved_activities a",
  "JOIN ppw_programmes p ON p.world_id=a.world_id",
  "AND p.promotion_id=a.promotion_id AND p.programme_id=a.programme_id",
  "WHERE a.world_id=$1 AND p.status='ACTIVE'",
  "AND a.week_index BETWEEN $2 AND $3",
  "ORDER BY a.promotion_id,a.programme_id,a.week_index DESC LIMIT 8001"
 ].join(" "),[worldId,Math.max(0,currentWeekIndex-9),currentWeekIndex]);
 if(recent.length>8000)throw new Error("Programme recency history exceeds safe batch");
 const key=(p:string,id:string)=>JSON.stringify([p,id]);
 const groups=new Map<string,typeof recent>();
 for(const item of recent){
  const k=key(item.promotion_id,item.programme_id);
  const a=groups.get(k)??[];a.push(item);groups.set(k,a);
 }
 const changed=active.flatMap(p=>{
  const events=groups.get(key(p.promotion_id,p.programme_id))??[];
  const signal=events.length?evaluateProgrammeSignals(events.map(x=>({
   programmeId:x.programme_id,weekIndex:x.week_index,
   signature:x.signature,impact:x.impact})),currentWeekIndex):
   {heat:p.heat===null?null:10,repetition:0};
  if(signal.heat===p.heat&&signal.repetition===p.repetition)return [];
  return [{promotion_id:p.promotion_id,programme_id:p.programme_id,
   heat:signal.heat,repetition:signal.repetition}];
 });
 if(changed.length){
  const saved=await tx.query<{programme_id:string}>([
   "UPDATE ppw_programmes p SET heat=x.heat,repetition=x.repetition",
   "FROM jsonb_to_recordset($2::jsonb) AS x(",
   "promotion_id text,programme_id text,heat double precision,",
   "repetition double precision)",
   "WHERE p.world_id=$1 AND p.promotion_id=x.promotion_id",
   "AND p.programme_id=x.programme_id AND p.status='ACTIVE'",
   "RETURNING p.programme_id"
  ].join(" "),[worldId,JSON.stringify(changed)]);
  if(saved.length!==changed.length)throw new Error("World programme population changed");
 }
 return {examined:active.length,changed:changed.length};
}
