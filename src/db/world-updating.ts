import {randomUUID} from "node:crypto";
import type {SqlRows} from "./world-operations.js";
import {withWorldTransaction,type TransactionPool} from "./transaction.js";
import {withSqlClient} from "./postgres.js";
import {loadRingsideCommentary} from "./ringside-commentary.js";
import {publishWeeklyWorldEditorial} from "./weekly-world-editorial.js";

type Scope={worldId:string;year:number;week:number};
type Job={show_id:string;promotion_id:string;player_id:string;state:string;busy:boolean};
type Claim={kind:"SHOW";scope:Scope;job:Job;token:string}|{kind:"PUBLIC";scope:Scope;token:string}|
 {kind:"WAIT"|"DONE"|"NONE"};
const outcome=(status:"PUBLISHED"|"LIMIT_REACHED"|"BLOCKED",action?:string,blockers:string[]=[])=>({
 status,steps:action?[{action,status:"EXECUTED"}]:[],blockers
});
/** Inside the authoritative rollover transaction, after all certified settlement. */
export async function startWorldUpdating(tx:SqlRows,scope:Scope){
 const p=[scope.worldId,scope.year,scope.week];
 await tx.query(`
  WITH run AS (
   INSERT INTO ppw_world_update_runs(world_id,year,week,state,public_state)
   VALUES($1,$2,$3,'ACTIVE','WAITING') RETURNING world_id,year,week
  )
  INSERT INTO ppw_world_update_jobs(world_id,year,week,show_id,promotion_id,player_id,show_day,state)
  SELECT c.world_id,c.year,c.week,c.show_id,c.promotion_id,p.player_id,coalesce(d.show_day,7),'WAITING'
  FROM run r JOIN ppw_completed_shows c USING(world_id,year,week)
  JOIN ppw_promotion_controls p ON p.world_id=c.world_id AND p.promotion_id=c.promotion_id AND p.active
  JOIN ppw_memberships m ON m.world_id=p.world_id AND m.player_id=p.player_id AND m.status='ACTIVE'
  JOIN ppw_booking_drafts d ON d.world_id=c.world_id AND d.draft_id=c.show_id
 `,p);
 const moved=await tx.query(`UPDATE ppw_worlds SET phase='UPDATING' WHERE world_id=$1 AND phase='OPEN' RETURNING world_id`,[scope.worldId]);
 if(moved.length!==1)throw Error("World updating could not be started");
}
type Dependencies={terraKey?:string;groqKey?:string;transport?:typeof fetch;
 generate?:typeof loadRingsideCommentary;publish?:typeof publishWeeklyWorldEditorial};
/** One invocation, one provider stage. No transaction spans a provider call.
 * Claims are fenced; an expired paid attempt is never automatically repeated. */
export async function processWorldUpdate(pool:TransactionPool,requested:Scope,deps:Dependencies){
 const claim=await withWorldTransaction<Claim>(pool,async tx=>{
  const worlds=await tx.query<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[requested.worldId]);
  const w=worlds[0];if(!w)return {kind:"NONE"};
  const next=(requested.year-1)*52+requested.week+1,current=(w.year-1)*52+w.week;
  if(w.phase!=="UPDATING"){
   if(current===next){
    const done=await tx.query("SELECT 1 FROM ppw_world_update_runs WHERE world_id=$1 AND year=$2 AND week=$3 AND state='COMPLETE'",
     [requested.worldId,requested.year,requested.week]);
    if(done.length)return {kind:"DONE"};
   }
   return {kind:"NONE"};
  }
  if(current!==next&&(w.year!==requested.year||w.week!==requested.week))return {kind:"WAIT"};
  const runs=await tx.query<{year:number;week:number;public_state:string;busy:boolean}>(`
   SELECT year,week,public_state,coalesce(public_claim_until>clock_timestamp(),false) AS busy
   FROM ppw_world_update_runs WHERE world_id=$1 AND state='ACTIVE'`,[requested.worldId]);
  const run=runs[0];if(!run)throw Error("Active World update is missing");
  const scope={worldId:requested.worldId,year:run.year,week:run.week},p=[scope.worldId,scope.year,scope.week];
  const jobs=await tx.query<Job>(`SELECT show_id,promotion_id,player_id,state,
   coalesce(claim_until>clock_timestamp(),false) AS busy
   FROM ppw_world_update_jobs WHERE world_id=$1 AND year=$2 AND week=$3
   AND state IN ('WAITING','PROCESSING') ORDER BY show_day,show_id LIMIT 1`,p);
  const job=jobs[0],token=randomUUID();
  if(job){
   if(job.state==="PROCESSING"&&job.busy)return {kind:"WAIT"};
   await tx.query(`UPDATE ppw_world_update_jobs SET state='PROCESSING',claim_token=$5,
    claim_until=clock_timestamp()+interval '210 seconds'
    WHERE world_id=$1 AND year=$2 AND week=$3 AND show_id=$4`,[...p,job.show_id,token]);
   return {kind:"SHOW",scope,job,token};
  }
  if(run.public_state==="PROCESSING"&&run.busy)return {kind:"WAIT"};
  await tx.query(`UPDATE ppw_world_update_runs SET public_state='PROCESSING',public_claim_token=$4,
   public_claim_until=clock_timestamp()+interval '90 seconds'
   WHERE world_id=$1 AND year=$2 AND week=$3 AND state='ACTIVE'`,[...p,token]);
  return {kind:"PUBLIC",scope,token};
 });
 if(claim.kind==="NONE")return null;
 if(claim.kind==="DONE")return outcome("PUBLISHED");
 if(claim.kind==="WAIT")return outcome("BLOCKED",undefined,["WORLD_UPDATE_IN_PROGRESS"]);
 if(claim.kind==="SHOW"){
  const {scope,job,token}=claim;
  let state="FALLBACK";
  try{
   const result=await (deps.generate??loadRingsideCommentary)(pool,{worldId:scope.worldId,
    promotionId:job.promotion_id,playerId:job.player_id,showId:job.show_id},
    deps.terraKey,deps.transport??fetch,"OPENAI","UPDATE");
   if(result.status==="ready")state="READY";
   if(result.status==="pending")return outcome("BLOCKED",undefined,["WORLD_UPDATE_IN_PROGRESS"]);
  }catch{/* Official certified result remains the fallback. */}
  const saved=await withSqlClient(pool,db=>db.query(`UPDATE ppw_world_update_jobs SET state=$6,claim_until=NULL
   WHERE world_id=$1 AND year=$2 AND week=$3 AND show_id=$4 AND claim_token=$5 AND state='PROCESSING'
   RETURNING show_id`,[scope.worldId,scope.year,scope.week,job.show_id,token,state]));
  return saved.length?outcome("LIMIT_REACHED","PREPARE_SHOW_ARTICLE"):outcome("BLOCKED",undefined,["WORLD_UPDATE_IN_PROGRESS"]);
 }
 if(claim.kind!=="PUBLIC")throw Error("Unknown World update stage");
 const {scope,token}=claim,p=[scope.worldId,scope.year,scope.week];
 let state="FALLBACK";
 if(deps.groqKey){
  try{
   const result=await (deps.publish??publishWeeklyWorldEditorial)(pool,scope,deps.groqKey,deps.transport??fetch);
   if(result.state==="READY"||result.state==="EMPTY")state="READY";
   else if(result.state==="SKIPPED"){
    const existing=await withSqlClient(pool,db=>db.query<{state:string}>(
     "SELECT state FROM ppw_weekly_world_editorial WHERE world_id=$1 AND year=$2 AND week=$3",p));
    if(["READY","EMPTY"].includes(existing[0]?.state??""))state="READY";
   }
  }catch{/* Certified public news remains available. */}
 }
 return withWorldTransaction(pool,async tx=>{
  await tx.query("SELECT world_id FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[scope.worldId]);
  const saved=await tx.query(`UPDATE ppw_world_update_runs SET state='COMPLETE',public_state=$5,
   public_claim_until=NULL,finished_at=clock_timestamp()
   WHERE world_id=$1 AND year=$2 AND week=$3 AND public_claim_token=$4 AND state='ACTIVE'
   AND NOT EXISTS(SELECT 1 FROM ppw_world_update_jobs j WHERE j.world_id=$1 AND j.year=$2 AND j.week=$3
    AND j.state IN ('WAITING','PROCESSING')) RETURNING world_id`,[...p,token,state]);
  if(!saved.length)return outcome("BLOCKED",undefined,["WORLD_UPDATE_IN_PROGRESS"]);
  await tx.query(`UPDATE ppw_weekly_world_editorial SET state='FAILED',diagnostic='INTERRUPTED',
   completed_at=clock_timestamp() WHERE world_id=$1 AND year=$2 AND week=$3 AND state='PENDING'`,p);
  const opened=await tx.query("UPDATE ppw_worlds SET phase='OPEN',revision=revision+1 WHERE world_id=$1 AND phase='UPDATING' RETURNING world_id",[scope.worldId]);
  if(opened.length!==1)throw Error("World update could not reopen booking");
  return outcome("PUBLISHED","PUBLISH_WORLD_EDITION");
 });
}
