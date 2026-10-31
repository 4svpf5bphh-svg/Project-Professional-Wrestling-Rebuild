import {premiumOnlyWeekSql} from "./premium-only-week.js";
/** Resolves the canonical submitted shows for one World week.
 * Each show is independently atomic and idempotent; a failed later show
 * leaves earlier receipts intact for deterministic retry.
 * This does not advance the World clock or run resource clearance.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {resolveCanonicalShow} from "./resolve-canonical-show.js";
export interface WorldWeekShowInput {
 worldId:string;year:number;week:number;resolutionId:string;
}
export interface WorldWeekShowSummary {
 year:number;week:number;required:number;recorded:number;retried:number;
 remaining:number;
}
export async function resolveWorldWeekShows(
 pool:TransactionPool,input:WorldWeekShowInput,
):Promise<WorldWeekShowSummary>{
 if(!input.worldId||!input.resolutionId||
  !Number.isSafeInteger(input.year)||input.year<1||
  !Number.isSafeInteger(input.week)||input.week<1||input.week>52)
  throw new Error("Invalid World week resolution scope");
 const shows=await withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{phase:string}>(
   "SELECT phase FROM ppw_worlds WHERE world_id=$1 AND year=$2 AND week=$3 FOR UPDATE",
   [input.worldId,input.year,input.week]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING")
   throw new Error("World must be resolving the requested week");
  return tx.query<{promotion_id:string;draft_id:string;booking_class:"REGULAR"|"PREMIUM"}>(
   `SELECT promotion_id,draft_id,booking_class FROM ppw_booking_drafts
      WHERE world_id=$1 AND year=$2 AND week=$3 AND status='SUBMITTED'
      ORDER BY promotion_id,booking_class DESC,draft_id`,
   [input.worldId,input.year,input.week]);
 });
 // A submitted-only list is insufficient: missing AI/staff/player shows
 // must block the whole week rather than silently count as completed.
 const active=await withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{phase:string}>(
   "SELECT phase FROM ppw_worlds WHERE world_id=$1 AND year=$2 AND week=$3 FOR UPDATE",
   [input.worldId,input.year,input.week]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING")
   throw new Error("World changed during show discovery");
  return tx.query<{promotion_id:string;premium_only_week:boolean}>(
   `SELECT p.promotion_id,(${premiumOnlyWeekSql("p")}) AS premium_only_week
      FROM ppw_promotions p
    WHERE p.world_id=$1 AND p.lifecycle='ACTIVE' AND NOT EXISTS (SELECT 1 FROM ppw_playtest_dark_weeks off_week
  WHERE off_week.world_id=p.world_id
   AND off_week.promotion_id=p.promotion_id
   AND off_week.year=$2 AND off_week.week=$3)
    ORDER BY p.promotion_id`,
   [input.worldId,input.year,input.week]);
 });
 if(active.length===0||active.length>128)
  throw new Error("Invalid active promotion population");
 const activeIds=new Set(active.map(p=>p.promotion_id));
 if(activeIds.size!==active.length||shows.length<active.length||
  shows.length>active.length*2||shows.some(x=>!activeIds.has(x.promotion_id)))
  throw new Error("World week incomplete: every active promotion needs a weekly show");
 const unique=new Set<string>(),regular=new Set<string>();
 for(const show of shows){
  const key=show.promotion_id+"\u0000"+show.booking_class;
  if(!show.promotion_id||!show.draft_id||
   !["REGULAR","PREMIUM"].includes(show.booking_class)||unique.has(key))
   throw new Error("Multiple or invalid submitted show classes");
  unique.add(key);
  if(show.booking_class==="REGULAR")regular.add(show.promotion_id);
 }
 if(active.some(p=>!regular.has(p.promotion_id)&&
   !(p.premium_only_week&&unique.has(p.promotion_id+"\u0000PREMIUM"))))
  throw new Error("World week incomplete: each promotion needs a regular show or a scheduled premium-only card");
 // Four shows per request bounds execution within Vercel's runtime budget.
 // Persisted previous receipts are immutable and need no re-scoring.
 const completed=await withWorldTransaction(pool,tx=>tx.query<{
  show_id:string;resolution_id:string
 }>("SELECT show_id,resolution_id FROM ppw_completed_shows WHERE world_id=$1 AND year=$2 AND week=$3",[
  input.worldId,input.year,input.week]));
 const done=new Map(completed.map(x=>[x.show_id,x.resolution_id]));
 if(completed.some(x=>x.resolution_id!==input.resolutionId||
   !shows.some(s=>s.draft_id===x.show_id)))
  throw new Error("World has conflicting completed-show evidence");
 const remainingShows=shows.filter(s=>!done.has(s.draft_id));
 let recorded=0,retried=0;
 for(const show of remainingShows.slice(0,4)){
  try{
   const result=await resolveCanonicalShow(pool,{
    worldId:input.worldId,promotionId:show.promotion_id,
    showId:show.draft_id,year:input.year,week:input.week,
    resolutionId:input.resolutionId,
   });
   if(result==="RECORDED")recorded++;
   else retried++;
  }catch(e){
   const why=e instanceof Error?e.message:"Unknown results failure";
   throw new Error("Show "+show.promotion_id+" could not settle: "+why);
  }
 }
 // Check the required set still matches and every result is durable.
 await withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{phase:string}>(
   "SELECT phase FROM ppw_worlds WHERE world_id=$1 AND year=$2 AND week=$3 FOR UPDATE",
   [input.worldId,input.year,input.week]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING")
   throw new Error("World changed during show resolution");
  const rows=await tx.query<{promotion_id:string;draft_id:string;resolution_id:string|null}>(
   `SELECT d.promotion_id,d.draft_id,r.resolution_id
      FROM ppw_booking_drafts d
      LEFT JOIN ppw_completed_shows r ON r.world_id=d.world_id
       AND r.show_id=d.draft_id AND r.promotion_id=d.promotion_id
      WHERE d.world_id=$1 AND d.year=$2 AND d.week=$3
       AND d.status='SUBMITTED' ORDER BY d.promotion_id,d.booking_class DESC,d.draft_id`,
   [input.worldId,input.year,input.week]);
  if(rows.length!==shows.length||rows.some((r,i)=>
   r.promotion_id!==shows[i]!.promotion_id||
   r.draft_id!==shows[i]!.draft_id||
   (r.resolution_id!==null&&r.resolution_id!==input.resolutionId)))
   throw new Error("World week has changed or conflicting submitted shows");
 });
 return {year:input.year,week:input.week,
  required:shows.length,recorded,retried,
  remaining:remainingShows.length-recorded-retried};
}
