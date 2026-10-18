/** Original PPW employment rules adapted to revision-guarded World SQL.
 * At most eight unique managers exist, from a static deterministic catalog.
 */
import {randomUUID} from "node:crypto";
import {applyWorldCommand} from "./world-commands.js";
import {worldTalentManagers} from "../domain/world-staff.js";
import type {TransactionPool} from "./transaction.js";
export interface StaffEmploymentInput{
 worldId:string;promotionId:string;playerId:string;
 requestId:string;expectedRevision:number;
}
const valid=(s:string)=>typeof s==="string"&&s.length>0&&s.length<=200;
export async function hireWorldTalentManager(pool:TransactionPool,
 input:StaffEmploymentInput&{staffId:string}){
 if(![input.worldId,input.promotionId,input.playerId,input.staffId].every(valid))
  throw new Error("Invalid manager hiring scope");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"HIRE_TALENT_MANAGER",requiresOpenWeek:true,
  execute:async tx=>{
   const employer=await tx.query<{seed:string;cash:string;year:number;week:number}>([
    "SELECT w.seed::text AS seed,p.cash::text AS cash,w.year,w.week",
    "FROM ppw_worlds w JOIN ppw_promotion_controls c",
    "ON c.world_id=w.world_id AND c.player_id=$2 AND c.promotion_id=$3 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id",
    "AND m.status='ACTIVE' JOIN ppw_promotions p ON p.world_id=c.world_id",
    "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
    "WHERE w.world_id=$1 LIMIT 1"
   ].join(" "),[input.worldId,input.playerId,input.promotionId]);
   if(employer.length!==1)throw new Error("Only your promotion may hire staff");
   const m=employer[0]!;
   const manager=worldTalentManagers(m.seed).find(p=>p.staffId===input.staffId);
   if(!manager)throw new Error("Unknown original World Talent Manager");
   if(Number(m.cash)<manager.weeklySalary*4)
    throw new Error("Four weeks of Talent Manager salary must be available");
   const employmentId="staff-employment-"+randomUUID();
   const current=(m.year-1)*52+m.week-1;
   const hired=await tx.query<{employment_id:string}>([
    "INSERT INTO ppw_staff_employments(world_id,employment_id,staff_id,",
    "promotion_id,status,weekly_salary,start_week_index)",
    "SELECT $1,$2,$3,$4,'ACTIVE',$5,$6",
    "WHERE NOT EXISTS(SELECT 1 FROM ppw_staff_employments e",
    "WHERE e.world_id=$1 AND e.status='ACTIVE'",
    "AND (e.staff_id=$3 OR e.promotion_id=$4))",
    "ON CONFLICT DO NOTHING RETURNING employment_id"
   ].join(" "),[input.worldId,employmentId,input.staffId,input.promotionId,
    manager.weeklySalary,current]);
   if(hired.length!==1)throw new Error("Manager already employed in this World");
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'TALENT_MANAGER_HIRED',",
    "jsonb_build_object('promotionId',$4::text,'staffId',$5::text,",
    "'employmentId',$6::text,'weeklySalary',$7::bigint))"
   ].join(" "),[input.worldId,m.year,m.week,input.promotionId,input.staffId,
    employmentId,manager.weeklySalary]);
   return {employmentId,staffId:input.staffId,
    name:manager.name,weeklySalary:manager.weeklySalary};
  }});
}
export async function releaseWorldTalentManager(pool:TransactionPool,
 input:StaffEmploymentInput&{employmentId:string}){
 if(![input.worldId,input.promotionId,input.playerId,input.employmentId].every(valid))
  throw new Error("Invalid Talent Manager release scope");
 return applyWorldCommand(pool,{worldId:input.worldId,playerId:input.playerId,
  requestId:input.requestId,expectedRevision:input.expectedRevision,
  commandType:"RELEASE_TALENT_MANAGER",requiresOpenWeek:true,
  execute:async tx=>{
   const owner=await tx.query<{year:number;week:number}>([
    "SELECT w.year,w.week FROM ppw_worlds w",
    "JOIN ppw_promotion_controls c ON c.world_id=w.world_id",
    "AND c.promotion_id=$2 AND c.player_id=$3 AND c.active",
    "JOIN ppw_memberships m ON m.world_id=c.world_id",
    "AND m.player_id=c.player_id AND m.status='ACTIVE'",
    "JOIN ppw_promotions p ON p.world_id=c.world_id",
    "AND p.promotion_id=c.promotion_id AND p.lifecycle='ACTIVE'",
    "WHERE w.world_id=$1 LIMIT 1"
   ].join(" "),[input.worldId,input.promotionId,input.playerId]);
   if(owner.length!==1)throw new Error("Staff release access denied");
   const {year,week}=owner[0]!,current=(year-1)*52+week-1;
   const released=await tx.query<{staff_id:string}>([
    "UPDATE ppw_staff_employments SET status='ENDED',ended_week_index=$4",
    "WHERE world_id=$1 AND promotion_id=$2",
    "AND employment_id=$3 AND status='ACTIVE' RETURNING staff_id"
   ].join(" "),[input.worldId,input.promotionId,input.employmentId,current]);
   if(released.length!==1)throw new Error("Talent Manager employment not active");
   // No manager may keep delegated authority after release. Pending wrestler
   // offers already submitted remain independent of that employment.
   await tx.query([
    "UPDATE ppw_staff_continuity_settings SET auto_renew_same_terms=false",
    "WHERE world_id=$1 AND promotion_id=$2"
   ].join(" "),[input.worldId,input.promotionId]);
   await tx.query([
    "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)",
    "VALUES($1,$2,$3,'TALENT_MANAGER_RELEASED',",
    "jsonb_build_object('promotionId',$4::text,'staffId',$5::text,",
    "'employmentId',$6::text))"
   ].join(" "),[input.worldId,year,week,input.promotionId,released[0]!.staff_id,input.employmentId]);
   return {employmentId:input.employmentId,staffId:released[0]!.staff_id};
  }});
}
