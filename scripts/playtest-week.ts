/** Manual *operator-only* one-week runner for an explicitly isolated playtest.
 * Never a web route or cron. Cannot override the single World Lock deadline.
 * Not to be executed against PPW original or production without authorisation.
 */
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {inspectWorldResolutionReadiness,planNextWorldResolutionAction,
 driveWorldResolution} from "../src/db/world-resolution-pipeline.js";
import {parsePlaytestWeekArgs,confirmPlaytestResolution,oneShotResolutionId}
 from "../src/domain/playtest-week-operator.js";

const usage=[
 "Read-only: npm run playtest:week -- --world <isolated-world-id>",
 "After explicit authorisation only:",
 "PPW_PLAYTEST_DB_URL=<isolated-db-connection> PPW_PLAYTEST_WORLD_ID=<world-id>",
 "PPW_ONE_SHOT_AUTHORIZED=YES npm run playtest:week -- --world <id>",
 "  --resolve --confirm-world <id> --confirm-host <database-hostname>",
 "No scheduler is installed. Early World Lock is never allowed."
].join("\n");
async function main(){
 if(process.argv.includes("--help")){console.log(usage);return;}
 const args=parsePlaytestWeekArgs(process.argv.slice(2));
 // Deliberately do not fall back to DATABASE_URL (the live game's DSN).
 const dsn=process.env.PPW_PLAYTEST_DB_URL;
 if(!dsn)throw new Error("An explicit isolated PPW_PLAYTEST_DB_URL is required");
 const parsed=new URL(dsn);
 if(!["postgres:","postgresql:"].includes(parsed.protocol)||!parsed.hostname)
  throw new Error("Invalid isolated PostgreSQL connection");
 const db=postgresPool(dsn,2);
 try{
  const clock=await withWorldTransaction(db.pool,async tx=>{
   const rows=await tx.query<{year:number;week:number;phase:string;
    revision:string|number;due:boolean}>(
    "SELECT year,week,phase,revision,(next_lock_at<=clock_timestamp()) AS due"+
    " FROM ppw_worlds WHERE world_id=$1",[args.worldId]);
   if(rows.length!==1)throw new Error("Selected World does not exist");
   const r=rows[0]!,revision=Number(r.revision);
   if(!Number.isSafeInteger(revision)||revision<0)
    throw new Error("Invalid World revision");
   return {...r,revision};
  });
  const before=await inspectWorldResolutionReadiness(db.pool,args.worldId);
  const plan=await planNextWorldResolutionAction(db.pool,args.worldId);
  console.log(JSON.stringify({mode:args.resolve?"ONE_SHOT":"INSPECT",
   databaseHost:parsed.hostname,worldId:args.worldId,
   year:clock.year,week:clock.week,phase:clock.phase,
   deadlineReached:clock.due,activePromotions:before.active,
   submittedShows:before.submitted,nextStage:plan.action,
   blockers:plan.blockers}));
  if(!args.resolve)return;
  confirmPlaytestResolution(args,{
   approved:process.env.PPW_ONE_SHOT_AUTHORIZED,
   configuredWorld:process.env.PPW_PLAYTEST_WORLD_ID,
   actualHost:parsed.hostname
  },clock);
  const resolutionId=oneShotResolutionId(args.worldId,clock.year,clock.week);
  if(clock.phase==="OPEN"){
   const lock=await lockWorldWeek(db.pool,{
    worldId:args.worldId,requestId:resolutionId+":lock",
    expectedRevision:clock.revision});
   if(lock.status!=="APPLIED"&&lock.status!=="REPLAYED")
    throw new Error("World changed before the one-shot deadline lock");
  }
  // Bounded resume-safe drive: no sleep, timer, poll, or external scheduling.
  // Never choose human outcomes if arbitration requires the player.
  for(let batch=0;batch<4;batch++){
   const result=await driveWorldResolution(db.pool,{
    worldId:args.worldId,resolutionId,maxStages:16});
   console.log(JSON.stringify({batch:batch+1,status:result.status,
    stages:result.steps.map(x=>x.action),blockers:result.blockers}));
   if(result.status==="BLOCKED"){
    process.exitCode=2;return;
   }
   if(result.status==="PUBLISHED"){
    const after=await inspectWorldResolutionReadiness(db.pool,args.worldId);
    console.log(JSON.stringify({status:"NEXT_WEEK_OPEN",
     year:after.year,week:after.week,phase:after.phase}));
    return;
   }
  }
  throw new Error("One-shot stage limit reached; inspect the World before resuming");
 }finally{await db.close();}
}
main().catch(error=>{
 console.error(error instanceof Error?error.message:"Playtest operator failed");
 process.exitCode=1;
});
