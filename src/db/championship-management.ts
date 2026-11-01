/** Account-authorised promotion belt creation. The lineage is real, vacant
 * until a certified contest; no hidden title handovers or weekly polling.
 * Existing imported championships keep their historical booking eligibility.
 */
import {randomUUID} from "node:crypto";
import {applyWorldCommand} from "./world-commands.js";
import type {TransactionPool} from "./transaction.js";

export type NewChampionshipKind="SECONDARY_MEN"|"WOMEN_SINGLES";
export interface CreateChampionshipInput{
 worldId:string;promotionId:string;playerId:string;requestId:string;
 expectedRevision:number;kind:NewChampionshipKind;name:string;
}
export async function createPromotionChampionship(pool:TransactionPool,input:CreateChampionshipInput){
 const name=input.name.trim().replace(/\s+/g," ");
 if(![input.worldId,input.promotionId,input.playerId,input.requestId].every(
  x=>typeof x==="string"&&x.length>0&&x.length<=200)||
  name.length<4||name.length>90||/[<>\x00-\x1f]/.test(name))
  throw new Error("Choose a championship name of 4–90 characters");
 if(input.kind!=="SECONDARY_MEN"&&input.kind!=="WOMEN_SINGLES")
  throw new Error("Unsupported new championship type");
 const gender=input.kind==="WOMEN_SINGLES"?"WOMEN":"MEN";
 const role=input.kind==="SECONDARY_MEN"?"SECONDARY":"PRIMARY";
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"CREATE_CHAMPIONSHIP",requiresOpenWeek:true,
  execute:async tx=>{
   const auth=await tx.query<{promotion_name:string;booking_open:boolean}>([
    "SELECT p.name AS promotion_name,",
    "(w.phase='OPEN' AND w.next_lock_at>clock_timestamp()) AS booking_open",
    "FROM ppw_worlds w JOIN ppw_promotion_controls control",
    "ON control.world_id=w.world_id AND control.player_id=$2",
    "AND control.promotion_id=$3 AND control.active",
    "JOIN ppw_memberships member ON member.world_id=w.world_id",
    "AND member.player_id=control.player_id AND member.status='ACTIVE'",
    "JOIN ppw_promotions p ON p.world_id=w.world_id",
    "AND p.promotion_id=control.promotion_id AND p.lifecycle='ACTIVE'",
    "WHERE w.world_id=$1"
   ].join(" "),[input.worldId,input.playerId,input.promotionId]);
   if(auth.length!==1||!auth[0]!.booking_open)
    throw new Error("Championship creation requires an open, controlled promotion");
   const existing=await tx.query<{name:string;division:string;title_role:string;
    booking_division:string|null}>([
    "SELECT name,division,title_role,booking_division",
    "FROM ppw_championships WHERE world_id=$1 AND promotion_id=$2",
    "AND status='ACTIVE' ORDER BY championship_id LIMIT 11"
   ].join(" "),[input.worldId,input.promotionId]);
   if(existing.length>10)throw new Error("Championship capacity exceeded");
   if(existing.length>=8)throw new Error("A promotion may have at most eight active titles");
   if(existing.some(x=>x.name.toLowerCase()===name.toLowerCase()))
    throw new Error("This promotion already has a title with that name");
   if(existing.some(x=>x.division==="SINGLES"&&x.title_role===role&&
     x.booking_division===gender))
    throw new Error("You already have an active title of this type");
   const championshipId="created:"+randomUUID();
   await tx.query([
    "INSERT INTO ppw_championships(world_id,promotion_id,championship_id,",
    "name,division,status,prestige,current_reign_id,title_role,booking_division)",
    "VALUES($1,$2,$3,$4,'SINGLES','ACTIVE',$5,NULL,$6,$7)"
   ].join(" "),[input.worldId,input.promotionId,championshipId,name,
    role==="PRIMARY"?36:28,role,gender]);
   const world=await tx.query<{year:number;week:number}>(
    "SELECT year,week FROM ppw_worlds WHERE world_id=$1",[input.worldId]);
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'CHAMPIONSHIP_CREATED',",
    "jsonb_build_object('promotionId',$4::text,'championshipId',$5::text,",
    "'name',$6::text,'division',$7::text,'role',$8::text))"
   ].join(" "),[input.worldId,world[0]!.year,world[0]!.week,
    input.promotionId,championshipId,name,gender,role]);
   return {championshipId,name,bookingDivision:gender,titleRole:role,vacant:true};
  }
 });
}
