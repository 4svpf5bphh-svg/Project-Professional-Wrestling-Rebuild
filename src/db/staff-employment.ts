/** Player-owned, revision-guarded World staff contracts. All decisions share
 * the World lock/receipt with booking and charge buyouts exactly once.
 */
import {randomUUID} from "node:crypto";
import {applyWorldCommand} from "./world-commands.js";
import {worldStaff,evaluateStaffOffer,staffBuyout,type StaffRole}
 from "../domain/world-staff.js";
import type {TransactionPool} from "./transaction.js";
import type {SqlRows} from "./world-operations.js";
export interface StaffEmploymentInput{
 worldId:string;promotionId:string;playerId:string;
 requestId:string;expectedRevision:number;
}
const valid=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
type ContractTerm=52|104;
const money=(n:number)=>Number.isSafeInteger(n)&&n>0&&n<=1_000_000;
async function employer(tx:SqlRows,
 input:StaffEmploymentInput){
 const owner=await tx.query<{seed:string;cash:string;year:number;week:number}>([
  "SELECT w.seed::text AS seed,p.cash::text AS cash,w.year,w.week",
  "FROM ppw_worlds w JOIN ppw_promotion_controls c",
  "ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active",
  "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
  "AND m.status='ACTIVE' JOIN ppw_promotions p ON p.world_id=c.world_id",
  "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
  "WHERE w.world_id=$1 LIMIT 1"
 ].join(" "),[input.worldId,input.playerId,input.promotionId]);
 if(owner.length!==1)throw new Error("Only your active promotion may manage staff");
 return owner[0]!;
}
export async function hireWorldStaff(pool:TransactionPool,
 input:StaffEmploymentInput&{staffId:string;weeklySalary:number;termWeeks:ContractTerm}){
 if(![input.worldId,input.promotionId,input.playerId,input.staffId].every(valid)||
  !money(input.weeklySalary)||![52,104].includes(input.termWeeks))
  throw new Error("Invalid staff contract offer");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"HIRE_WORLD_STAFF",requiresOpenWeek:true,
  execute:async tx=>{
   const m=await employer(tx,input);
   const member=worldStaff(m.seed).find(p=>p.staffId===input.staffId);
   if(!member)throw new Error("Unknown World staff candidate");
   const current=(m.year-1)*52+m.week-1;
   const verdict=evaluateStaffOffer(member,input.weeklySalary,input.termWeeks);
   if(!verdict.accepted)return {accepted:false,staffId:member.staffId,
    reason:member.name+" declined the proposed salary."};
   if(Number(m.cash)<input.weeklySalary*4)
    throw new Error("Four weeks of the offered staff salary must be available");
   const employmentId="staff-employment-"+randomUUID();
   const initialMorale=Math.max(50,Math.min(90,Math.round(74+
    (input.weeklySalary-member.weeklySalary)/
     Math.max(100,member.weeklySalary)*32)));
   const saved=await tx.query<{employment_id:string}>([
    "INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,",
    "promotion_id,role,status,weekly_salary,start_week_index,term_weeks,expires_week_index,morale)",
    "SELECT $1,$2,$3,$4,$5,'ACTIVE',$6,$7,$8,$9,$10",
    "WHERE NOT EXISTS(SELECT 1 FROM ppw_staff_employments e",
    "WHERE e.world_id=$1 AND e.status='ACTIVE'",
    "AND (e.staff_id=$3 OR (e.promotion_id=$4 AND e.role=$5)))",
    "ON CONFLICT DO NOTHING RETURNING employment_id"
   ].join(" "),[input.worldId,employmentId,member.staffId,input.promotionId,
    member.role,input.weeklySalary,current,input.termWeeks,current+input.termWeeks-1,initialMorale]);
   if(saved.length!==1)throw new Error("Staff member or department already employed in this World");
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'STAFF_HIRED',",
    "jsonb_build_object('promotionId',$4::text,'staffId',$5::text,",
    "'employmentId',$6::text,'role',$7::text,'weeklySalary',$8::bigint,",
    "'termWeeks',$9::integer))"
   ].join(" "),[input.worldId,m.year,m.week,input.promotionId,member.staffId,
    employmentId,member.role,input.weeklySalary,input.termWeeks]);
   return {accepted:true,employmentId,staffId:member.staffId,
    name:member.name,role:member.role,weeklySalary:input.weeklySalary,morale:initialMorale,
    termWeeks:input.termWeeks,expiresWeekIndex:current+input.termWeeks-1};
  }});
}
/** Legacy RPC stays compatible but now creates the agreed simple one-year deal. */
export async function hireWorldTalentManager(pool:TransactionPool,
 input:StaffEmploymentInput&{staffId:string}){
 const {withSqlClient}=await import("./postgres.js");
 const seeds=await withSqlClient(pool,tx=>tx.query<{seed:string}>([
  "SELECT w.seed::text FROM ppw_worlds w",
  "JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
  "AND c.player_id=$2 AND c.promotion_id=$3 AND c.active",
  "JOIN ppw_memberships m ON m.world_id=c.world_id",
  "AND m.player_id=c.player_id AND m.status='ACTIVE'",
  "WHERE w.world_id=$1"
 ].join(" "),[input.worldId,input.playerId,input.promotionId]));
 if(seeds.length!==1)throw new Error("Staff hiring access denied");
 const member=worldStaff(seeds[0]!.seed).find(m=>m.staffId===input.staffId&&m.role==="TALENT_MANAGER");
 if(!member)throw new Error("Unknown World Talent Manager");
 return hireWorldStaff(pool,{...input,weeklySalary:member.weeklySalary,termWeeks:52});
}
export async function releaseWorldStaff(pool:TransactionPool,
 input:StaffEmploymentInput&{employmentId:string}){
 if(![input.worldId,input.promotionId,input.playerId,input.employmentId].every(valid))
  throw new Error("Invalid staff release scope");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"RELEASE_WORLD_STAFF",requiresOpenWeek:true,
  execute:async tx=>{
   const owner=await employer(tx,input);
   const current=(owner.year-1)*52+owner.week-1;
   const rows=await tx.query<{staff_id:string;role:StaffRole;weekly_salary:string;
    expires_week_index:number}>([
    "SELECT staff_id,role,weekly_salary::text,expires_week_index",
    "FROM ppw_staff_employments WHERE world_id=$1 AND promotion_id=$2",
    "AND employment_id=$3 AND status='ACTIVE'"
   ].join(" "),[input.worldId,input.promotionId,input.employmentId]);
   if(rows.length!==1)throw new Error("Staff employment not active");
   const employee=rows[0]!;
   const cost=staffBuyout(Number(employee.weekly_salary),employee.expires_week_index,current);
   const debited=await tx.query<{cash:string}>(
    "UPDATE ppw_promotions SET cash=cash-$3 WHERE world_id=$1 AND promotion_id=$2 AND cash>=$3 RETURNING cash::text",
    [input.worldId,input.promotionId,cost]);
   if(debited.length!==1)throw new Error("Insufficient cash for the full staff contract buyout");
   const ended=await tx.query<{staff_id:string}>(
    "UPDATE ppw_staff_employments SET status='ENDED',ended_week_index=$4 WHERE world_id=$1 AND promotion_id=$2 AND employment_id=$3 AND status='ACTIVE' RETURNING staff_id",
    [input.worldId,input.promotionId,input.employmentId,current]);
   if(ended.length!==1)throw new Error("Staff release failed");
   if(employee.role==="TALENT_MANAGER")await tx.query(
    "UPDATE ppw_staff_continuity_settings SET auto_renew_same_terms=false WHERE world_id=$1 AND promotion_id=$2",
    [input.worldId,input.promotionId]);
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'STAFF_BUYOUT',",
    "jsonb_build_object('promotionId',$4::text,'staffId',$5::text,",
    "'employmentId',$6::text,'role',$7::text,'amount',$8::bigint))"
   ].join(" "),[input.worldId,owner.year,owner.week,input.promotionId,
    employee.staff_id,input.employmentId,employee.role,cost]);
   return {employmentId:input.employmentId,staffId:employee.staff_id,
    buyoutCost:cost,remainingCash:Number(debited[0]!.cash)};
  }});
}
export const releaseWorldTalentManager=releaseWorldStaff;
export async function renewWorldStaff(pool:TransactionPool,
 input:StaffEmploymentInput&{employmentId:string;weeklySalary:number;termWeeks:ContractTerm}){
 if(![input.worldId,input.promotionId,input.playerId,input.employmentId].every(valid)||
  !money(input.weeklySalary)||![52,104].includes(input.termWeeks))
  throw new Error("Invalid staff renewal offer");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"RENEW_WORLD_STAFF",requiresOpenWeek:true,
  execute:async tx=>{
   const m=await employer(tx,input),current=(m.year-1)*52+m.week-1;
   const rows=await tx.query<{staff_id:string;expires_week_index:number;morale:number}>(
    "SELECT staff_id,expires_week_index,morale FROM ppw_staff_employments WHERE world_id=$1 AND promotion_id=$2 AND employment_id=$3 AND status='ACTIVE'",
    [input.worldId,input.promotionId,input.employmentId]);
   if(rows.length!==1)throw new Error("Staff employment not active");
   const contract=rows[0]!;
   if(contract.expires_week_index-current>12)
    throw new Error("Staff renewal opens in the final 13 weeks");
   const member=worldStaff(m.seed).find(s=>s.staffId===contract.staff_id);
   if(!member)throw new Error("Unknown World staff employee");
   if(!evaluateStaffOffer(member,input.weeklySalary,input.termWeeks).accepted||
     (contract.morale<40&&input.weeklySalary<Math.ceil(member.weeklySalary*1.07)))
    return {accepted:false,reason:member.name+" declined the proposed renewal."};
   if(Number(m.cash)<input.weeklySalary*4)
    throw new Error("Four weeks of the renewed salary must be available");
   const expiry=contract.expires_week_index+input.termWeeks;
   await tx.query([
    "UPDATE ppw_staff_employments SET weekly_salary=$4,term_weeks=$5,expires_week_index=$6,",
    "morale=least(100,greatest(0,morale+CASE WHEN $4::bigint>=$7::bigint THEN 5 ELSE -3 END))",
    "WHERE world_id=$1 AND promotion_id=$2 AND employment_id=$3 AND status='ACTIVE'"
   ].join(" "),[input.worldId,input.promotionId,input.employmentId,
    input.weeklySalary,input.termWeeks,expiry,member.weeklySalary]);
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'STAFF_RENEWED',jsonb_build_object(",
    "'promotionId',$4::text,'staffId',$5::text,'employmentId',$6::text,",
    "'weeklySalary',$7::bigint,'termWeeks',$8::integer))"
   ].join(" "),[input.worldId,m.year,m.week,input.promotionId,member.staffId,
    input.employmentId,input.weeklySalary,input.termWeeks]);
   return {accepted:true,staffId:member.staffId,employmentId:input.employmentId,
    weeklySalary:input.weeklySalary,termWeeks:input.termWeeks,expiresWeekIndex:expiry};
  }});
}
