import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
import {applyWorldCommand} from "./world-commands.js";
import {creativeDecisionScore,type CreativeContract} from "../domain/match-creative-consent.js";
import type {StandingOutcome} from "../domain/standing-programme-creative.js";

export type StandingRequest={
 worldId:string;promotionId:string;playerId:string;programmeId:string;
 personId:string;requestId:string;expectedRevision:number;
 matchType:"SINGLES"|"TAG";permittedOutcome:StandingOutcome;termWeeks:number;
};
export async function programmeSidePeople(tx:SqlRows,worldId:string,
 promotionId:string,programmeIds:readonly string[]){
 if(!programmeIds.length)return new Map<string,{A:string[];B:string[]}>();
 const rows=await tx.query<{programme_id:string;side:"A"|"B";people:string[]}>([
  "SELECT r.programme_id,r.side,",
  "array_agg(DISTINCT CASE WHEN r.ref_kind='PERSON'",
  "THEN r.ref_id ELSE tm.person_id END) AS people",
  "FROM ppw_programme_side_refs r",
  "LEFT JOIN ppw_tag_team_members tm ON tm.world_id=r.world_id",
  "AND tm.team_id=r.ref_id AND tm.active AND r.ref_kind='TEAM'",
  "WHERE r.world_id=$1 AND r.promotion_id=$2",
  "AND r.programme_id=ANY($3::text[])",
  "AND (r.ref_kind='PERSON' OR tm.person_id IS NOT NULL)",
  "GROUP BY r.programme_id,r.side ORDER BY r.programme_id,r.side LIMIT 401"
 ].join(" "),[worldId,promotionId,programmeIds]);
 if(rows.length>400)throw new Error("Rivalry roster capacity exceeded");
 const all=new Map<string,{A:string[];B:string[]}>();
 for(const row of rows){
  const sides=all.get(row.programme_id)??{A:[],B:[]};
  sides[row.side]=row.people.sort();
  all.set(row.programme_id,sides);
 }
 return all;
}
export async function requestStandingCreativeAgreement(pool:TransactionPool,
 input:StandingRequest){
 if(![input.worldId,input.promotionId,input.playerId,input.programmeId,
  input.personId,input.requestId].every(x=>typeof x==="string"&&x.trim()&&x.length<=200)||
  !["SINGLES","TAG"].includes(input.matchType)||
  !["WIN_ONLY","WIN_OR_PROTECTED_LOSS"].includes(input.permittedOutcome)||
  !Number.isSafeInteger(input.termWeeks)||input.termWeeks<1||input.termWeeks>6)
  throw new Error("Invalid standing match agreement");
 return applyWorldCommand(pool,{
  worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
  expectedRevision:input.expectedRevision,requiresOpenWeek:true,
  commandType:"REQUEST_PROGRAMME_CREATIVE_AGREEMENT",
  execute:async tx=>{
   const owner=await tx.query<{year:number;week:number}>([
    "SELECT w.year,w.week FROM ppw_worlds w",
    "JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
    "AND c.player_id=$2 AND c.promotion_id=$3 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id",
    "AND m.player_id=c.player_id AND m.status='ACTIVE'",
    "JOIN ppw_promotions p ON p.world_id=c.world_id",
    "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
    "JOIN ppw_programmes programme ON programme.world_id=p.world_id",
    "AND programme.promotion_id=p.promotion_id",
    "AND programme.programme_id=$4 AND programme.status='ACTIVE'",
    "WHERE w.world_id=$1 AND w.phase='OPEN' AND w.next_lock_at>clock_timestamp()"
   ].join(" "),[input.worldId,input.playerId,input.promotionId,input.programmeId]);
   if(owner.length!==1)throw new Error("This rivalry is not available");
   const week=(owner[0]!.year-1)*52+owner[0]!.week-1;
   const people=await programmeSidePeople(tx,input.worldId,input.promotionId,[input.programmeId]);
   const sides=people.get(input.programmeId);
   const mine=sides?.A.includes(input.personId)?"A":
    sides?.B.includes(input.personId)?"B":null;
   if(!mine||!sides?.A.length||!sides.B.length)
    throw new Error("Only a current rivalry participant can make this agreement");
   const own=sides[mine],opponents=sides[mine==="A"?"B":"A"];
