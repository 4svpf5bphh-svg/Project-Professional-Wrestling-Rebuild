/** Durable, resumable date accounting for every active promotion.
 * A World row lock guards discovery, while each existing consumption command
 * performs the authoritative contract checks and atomic decrements.
 */
import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {consumeShowAppearances} from "./appearance-consumption.js";
export interface WorldAppearanceInput{
 worldId:string;year:number;week:number;resolutionId:string;
}
export async function consumeWorldWeekAppearances(
 pool:TransactionPool,input:WorldAppearanceInput,
){
 if(!input.worldId||!input.resolutionId||
  !Number.isSafeInteger(input.year)||input.year<1||
  !Number.isSafeInteger(input.week)||input.week<1||input.week>52)
  throw new Error("Invalid appearance resolution scope");
 const weekIndex=(input.year-1)*52+input.week-1;
 if(!Number.isSafeInteger(weekIndex))throw new Error("Invalid World week index");
 const shows=await withWorldTransaction(pool,async tx=>{
  const world=await tx.query<{phase:string}>(
   "SELECT phase FROM ppw_worlds WHERE world_id=$1 AND year=$2 AND week=$3 FOR UPDATE",
   [input.worldId,input.year,input.week]);
  if(world.length!==1||world[0]!.phase!=="RESOLVING")
   throw new Error("World changed during appearance resolution");
  const rows=await tx.query<{
   promotion_id:string;draft_id:string|null;booking_class:"REGULAR"|"PREMIUM"|null;resolved_show_id:string|null;
  }>(`SELECT p.promotion_id,d.draft_id,d.booking_class,r.show_id AS resolved_show_id
    FROM ppw_promotions p
    LEFT JOIN ppw_booking_drafts d ON d.world_id=p.world_id
     AND d.promotion_id=p.promotion_id AND d.year=$2 AND d.week=$3
     AND d.status='SUBMITTED'
    LEFT JOIN ppw_show_resolutions r ON r.world_id=d.world_id
     AND r.show_id=d.draft_id AND r.promotion_id=p.promotion_id
     AND r.resolved_week_index=$4
    WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
    ORDER BY p.promotion_id,d.booking_class DESC`,[input.worldId,input.year,input.week,weekIndex]);
  if(rows.length<1||rows.length>256||rows.some(r=>!r.draft_id))
   throw new Error("Every active promotion needs a submitted weekly show");
  const byPromotion=new Map<string,Set<string>>();
  for(const row of rows){
   const seen=byPromotion.get(row.promotion_id)??new Set<string>();
   if(!row.booking_class||seen.has(row.booking_class))
    throw new Error("Duplicate submitted show class");
   seen.add(row.booking_class);byPromotion.set(row.promotion_id,seen);
  }
  if([...byPromotion.values()].some(k=>!k.has("REGULAR")))
   throw new Error("Every active promotion needs a regular weekly show");
  const clearance=await tx.query<{eligible_promotions:number}>(
   "SELECT eligible_promotions FROM ppw_week_resource_clearances WHERE world_id=$1 AND year=$2 AND week=$3",
   [input.worldId,input.year,input.week]);
  if(clearance.length!==1||clearance[0]!.eligible_promotions!==byPromotion.size)
   throw new Error("Week resources must be cleared before charging dates");
  return rows.map(r=>({...r,draft_id:r.draft_id!}));
 });
 let charged=0,retried=0;
 for(const show of shows){
  if(show.resolved_show_id){retried++;continue;}
  const revision=await withWorldTransaction(pool,async tx=>{
   const world=await tx.query<{revision:string|number;phase:string;year:number;week:number}>(
    "SELECT revision,phase,year,week FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",
    [input.worldId]);
   if(world.length!==1||world[0]!.phase!=="RESOLVING"||
    world[0]!.year!==input.year||world[0]!.week!==input.week)
    throw new Error("World changed while charging appearances");
   const n=Number(world[0]!.revision);
   if(!Number.isSafeInteger(n)||n<0)throw new Error("Invalid World revision");
   return n;
  });
  const requestId=`${input.resolutionId}:${input.year}:${input.week}:dates:${show.draft_id}`;
  if(requestId.length>200)throw new Error("Appearance command ID exceeds limit");
  const result=await consumeShowAppearances(pool,{
   worldId:input.worldId,playerId:"system",promotionId:show.promotion_id,
   showId:show.draft_id,requestId,expectedRevision:revision,
  });
  if(result.status==="STALE")throw new Error("World revision changed during date consumption");
  if(result.status==="APPLIED")charged++;else retried++;
 }
 const verified=await withWorldTransaction(pool,async tx=>{
  const rows=await tx.query<{count:number}>(`SELECT count(*)::integer AS count
   FROM ppw_promotions p
   JOIN ppw_booking_drafts d ON d.world_id=p.world_id
    AND d.promotion_id=p.promotion_id AND d.year=$2 AND d.week=$3
    AND d.status='SUBMITTED'
   JOIN ppw_show_resolutions r ON r.world_id=d.world_id
    AND r.show_id=d.draft_id AND r.promotion_id=p.promotion_id
    AND r.resolved_week_index=$4
   WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'`,
   [input.worldId,input.year,input.week,weekIndex]);
  return rows.length===1?rows[0]!.count:-1;
 });
 if(verified!==shows.length)throw new Error("Appearance receipts incomplete after resolution");
 return {year:input.year,week:input.week,required:shows.length,charged,retried};
}
