/** CI-only genuine 13-promotion Week 1 resolution after TWO independent
 * people have authored and confirmed their actual imported-GENESIS cards.
 * No scheduler, no external Neon instance, no real deadline manipulation.
 */
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import assert from "node:assert/strict";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";

async function main(){
 const value=process.env.PPW_PLAYTEST_DB_URL;
 if(process.env.CI!=="true"||
  process.env.PPW_REAL_WORLD_RESOLUTION_SMOKE!=="YES"||
  !value||!process.env.SOURCE_FILE)
  throw new Error("World-resolution smoke requires explicit disposable CI authorisation");
 const dsn=new URL(value);
 if(dsn.hostname!=="localhost"&&dsn.hostname!=="127.0.0.1"||
  dsn.pathname!=="/ppw_test"||dsn.username!=="ppw_test")
  throw new Error("World-resolution test forbids live Neon and production databases");
 const source=JSON.parse(readFileSync(process.env.SOURCE_FILE,"utf8")) as {
  world:{id:string};promotions:unknown[];people:unknown[]
 };
 assert.equal(source.promotions.length,13);
 assert.equal(source.people.length,643);
 const worldId=source.world.id;
 const db=postgresPool(value,3);
 try{
  const state=await withWorldTransaction(db.pool,async tx=>{
   const world=await tx.query<{year:number;week:number;phase:string;
    revision:string|number}>(
    "SELECT year,week,phase,revision FROM ppw_worlds WHERE world_id=$1",
    [worldId]);
   assert.equal(world.length,1);
   const rows=await tx.query<{promotion_id:string;draft_id:string;
    lock_ready_fingerprint:string}>(`
    SELECT d.promotion_id,d.draft_id,d.lock_ready_fingerprint
    FROM ppw_booking_drafts d
    JOIN ppw_promotion_controls c ON c.world_id=d.world_id
     AND c.promotion_id=d.promotion_id AND c.active
    WHERE d.world_id=$1 AND d.year=1 AND d.week=1 AND
     d.lock_ready_fingerprint IS NOT NULL
    ORDER BY d.promotion_id`,[worldId]);
   return {world:world[0]!,drafts:rows};
  });
  assert.equal(state.world.year,1);assert.equal(state.world.week,1);
  assert.equal(state.world.phase,"OPEN");
  assert.equal(state.drafts.length,2,
   "Both real managers must author and explicitly prepare shows before World Lock");
  assert.equal(new Set(state.drafts.map(x=>x.promotion_id)).size,2);
  // Only THIS process-created, disposable CI world gets an expired deadline.
  // This is not a cron, a production World or a playable-client action.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second'"+
   " WHERE world_id=$1 AND year=1 AND week=1 AND phase='OPEN'",[worldId]));
  const locked=await lockWorldWeek(db.pool,{worldId,
   requestId:"ci-authentic-world-lock-"+randomUUID(),
   expectedRevision:Number(state.world.revision)});
  assert.equal(locked.status,"APPLIED","Authentic World Lock must respect submitted human intent");
  const resolutionId="ci-original-main-resolution-"+randomUUID();
  const stages:string[]=[];
  let status:string="";
  for(let batch=0;batch<4;batch++){
   const result=await driveWorldResolution(db.pool,{worldId,
    resolutionId,maxStages:16});
   status=result.status;
   stages.push(...result.steps.map(x=>x.action));
   if(result.status==="PUBLISHED")break;
   if(result.status==="BLOCKED")
    throw new Error("Real World resolution blocked: "+
     JSON.stringify(result.blockers));
  }
  assert.equal(status,"PUBLISHED",
   "Two actual human shows and the remaining AI promotions must settle a complete World week");
  const settled=await withWorldTransaction(db.pool,async tx=>{
   const world=await tx.query<{year:number;week:number;phase:string}>(
    "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]);
   const completed=await tx.query<{n:number}>(`
    SELECT count(*)::integer AS n FROM ppw_completed_shows WHERE world_id=$1`,[worldId]);
   const humans=await tx.query<{draft_id:string;n:number}>(`
    SELECT d.draft_id,count(c.show_id)::integer AS n
    FROM ppw_booking_drafts d
    LEFT JOIN ppw_completed_shows c ON c.world_id=d.world_id AND
     c.show_id=d.draft_id
    WHERE d.world_id=$1 AND d.draft_id=ANY($2::text[])
    GROUP BY d.draft_id ORDER BY d.draft_id`,
    [worldId,state.drafts.map(x=>x.draft_id)]);
   const seal=await tx.query<{certified_promotions:number}>(`
    SELECT certified_promotions FROM ppw_week_resolution_seals
    WHERE world_id=$1 AND year=1 AND week=1`,[worldId]);
   return {world:world[0]!,completed:completed[0]!.n,humans,seal};
  });
  assert.deepEqual(settled.world,{year:1,week:2,phase:"OPEN"});
  assert.equal(settled.completed,13,
   "All active real and independent promotions deliver exactly one Week 1 television show");
  assert.ok(settled.humans.every(x=>x.n===1),
   "Both managers must receive durable results for their authored show");
  assert.equal(settled.seal[0]?.certified_promotions,13);
  console.log(JSON.stringify({status:"AUTHENTIC_TWO_MANAGER_WEEK_PUBLISHED",
   promotionCount:13,wrestlers:643,confirmedHumanShows:state.drafts.length,
   completedShows:settled.completed,year:settled.world.year,
   nextWeek:settled.world.week,stages}));
 }finally{await db.close();}
}
main().catch(error=>{
 console.error(error instanceof Error?error.message:"Authentic CI resolution failed");
 process.exitCode=1;
});
