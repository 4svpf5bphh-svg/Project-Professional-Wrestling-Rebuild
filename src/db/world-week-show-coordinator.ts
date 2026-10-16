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
  return tx.query<{promotion_id:string;draft_id:string}>(
   `SELECT promotion_id,draft_id FROM ppw_booking_drafts
      WHERE world_id=$1 AND year=$2 AND week=$3 AND status='SUBMITTED'
      ORDER BY promotion_id,draft_id`,
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
  return tx.query<{promotion_id:string}>(
   "SELECT promotion_id FROM ppw_promotions WHERE world_id=$1 AND lifecycle='ACTIVE' ORDER BY promotion_id",
   [input.worldId]);
 });
 if(active.length===0||active.length>128)
  throw new Error("Invalid active promotion population");
 const requiredIds=new Set(active.map(p=>p.promotion_id));
 if(requiredIds.size!==active.length||shows.length!==active.length||
  shows.some(x=>!requiredIds.has(x.promotion_id)))
  throw new Error("World week incomplete: every active promotion needs a submitted show");
 const unique=new Set<string>();
 for(const show of shows){
  if(!show.promotion_id||!show.draft_id||
   unique.has(show.promotion_id))
   throw new Error("Multiple or invalid submitted shows for one promotion");
  unique.add(show.promotion_id);
 }
 let recorded=0,retried=0;
 for(const show of shows){
  const result=await resolveCanonicalShow(pool,{
   worldId:input.worldId,promotionId:show.promotion_id,
   showId:show.draft_id,year:input.year,week:input.week,
   resolutionId:input.resolutionId,
  });
  if(result==="RECORDED")recorded++;
  else retried++;
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
       AND d.status='SUBMITTED' ORDER BY d.promotion_id,d.draft_id`,
   [input.worldId,input.year,input.week]);
  if(rows.length!==active.length||rows.some((r,i)=>
   r.promotion_id!==shows[i]!.promotion_id||
   r.draft_id!==shows[i]!.draft_id||
   r.resolution_id!==input.resolutionId))
   throw new Error("World week has unresolved or changed submitted shows");
 });
 return {year:input.year,week:input.week,
  required:shows.length,recorded,retried};
}
