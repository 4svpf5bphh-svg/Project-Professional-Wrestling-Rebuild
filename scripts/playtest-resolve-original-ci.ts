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
import {readCompletedShowView} from "../src/db/show-results-view.js";
import {loadRingsideCommentary} from "../src/db/ringside-commentary.js";
import {readCompletedShowArchive} from "../src/db/completed-show-archive.js";
import {readSixWeekPlanner,planShowWeek} from "../src/db/planner-workspace.js";
import {readShowCardEditor} from "../src/db/show-card-editor.js";

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
    player_id:string;lock_ready_fingerprint:string}>(`
    SELECT d.promotion_id,d.draft_id,c.player_id,d.lock_ready_fingerprint
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
   if(result.status==="BLOCKED"){
    const diagnostic=await withWorldTransaction(db.pool,tx=>
     tx.query<{payload:unknown}>(`
      SELECT payload FROM ppw_ledger_events WHERE world_id=$1
       AND event_type='STAFF_FALLBACK_CARDS_CREATED'
      ORDER BY event_id DESC LIMIT 1`,[worldId]));
    throw new Error("Real World resolution blocked: "+
     JSON.stringify({blockers:result.blockers,
      staff:diagnostic[0]?.payload??null,stages}));
   }
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
  // Prove both separate managers can continue playing through THEIR genuine
  // Results, historical archive and week-two planner, without reading a rival.
  // Editorial generation is separate from World resolution. Rival and AI
  // shows cannot be routed to Groq, even when a caller guesses their IDs.
  const aiExample=await withWorldTransaction(db.pool,tx=>tx.query<{
   show_id:string;promotion_id:string
  }>(`
    SELECT c.show_id,c.promotion_id FROM ppw_completed_shows c
    WHERE c.world_id=$1 AND NOT EXISTS(
     SELECT 1 FROM ppw_promotion_controls control
     WHERE control.world_id=c.world_id
      AND control.promotion_id=c.promotion_id AND control.active)
    ORDER BY c.show_id LIMIT 1`,[worldId]));
  assert.equal(aiExample.length,1,"World has at least one autonomous AI show");
  let contactedModel=false;
  const rejectNetwork:typeof fetch=async()=>{
   contactedModel=true;throw new Error("Disallowed model request");
  };
  await assert.rejects(loadRingsideCommentary(db.pool,{
   worldId,playerId:state.drafts[0]!.player_id,
   promotionId:aiExample[0]!.promotion_id,showId:aiExample[0]!.show_id
  },"disposable-test-key",rejectNetwork),/unavailable to this controller/);
  assert.equal(contactedModel,false,"AI company has no model generation path");
  const humanResult=await loadRingsideCommentary(db.pool,{
   worldId,playerId:state.drafts[0]!.player_id,
   promotionId:state.drafts[0]!.promotion_id,showId:state.drafts[0]!.draft_id
  },undefined,rejectNetwork);
  assert.deepEqual(humanResult,{status:"unavailable"},
   "Missing Groq key leaves deterministic official Results untouched");
  assert.equal(contactedModel,false);
  const editorialRows=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(`
   SELECT count(*)::text AS n FROM ppw_ringside_reports WHERE world_id=$1`,
   [worldId]));
  assert.equal(editorialRows[0]?.n,"0",
   "Neither autonomous AI World shows nor unconfigured human shows may spend on Groq");
  const readableResults=[];
  for(const draft of state.drafts){
   const owner={worldId,playerId:draft.player_id,promotionId:draft.promotion_id};
   const result=await readCompletedShowView(db.pool,{...owner,showId:draft.draft_id});
   assert.equal(result.showId,draft.draft_id);
   assert.equal(result.year,1);assert.equal(result.week,1);
   assert.equal(result.matchCount,1,"Actual authored first-week result must be visible");
   const bouts=result.entries.filter(e=>e.type==="MATCH");
   assert.equal(bouts.length,1);
   assert.equal(bouts[0]?.matchContext?.winnerNames.length,1,
    "Results must show the player's actual authored winner");
   const archive=await readCompletedShowArchive(db.pool,owner);
   assert.ok(archive.items.some(e=>e.showId===draft.draft_id&&e.matchCount===1),
    "Resolved Week 1 show must survive in the owner's immutable archive");
   const nextPlan=await readSixWeekPlanner(db.pool,owner);
   assert.equal(nextPlan.year,1);
   assert.equal(nextPlan.week,2);
   assert.equal(nextPlan.weeks[0]?.week,2);
   assert.ok(nextPlan.venues.length>0);
   // Original fictional companies may run on an every-2/3/4-week cadence.
   // Do not force a weekly programme that is not on the player's calendar.
   // Verify the next real scheduled show can be planned ahead, while only
   // opening the editor when that show belongs to the current PPW week.
   const dueWeek=nextPlan.weeks.find(w=>
    w.scheduled.some(x=>x.eventType==="REGULAR"));
   const weekly=dueWeek?.scheduled.find(x=>x.eventType==="REGULAR");
   const venue=nextPlan.venues.find(x=>x.home)??nextPlan.venues[0];
   assert.ok(dueWeek&&weekly&&venue,
    "A promotion's real next regular show must be available within the planning window");
   const continued=await planShowWeek(db.pool,{...owner,
    requestId:"ci-next-show-"+owner.promotionId,
    expectedRevision:nextPlan.worldRevision,
    year:dueWeek.year,week:dueWeek.week,
    day:owner.promotionId===state.drafts[0]!.promotion_id?3:5,
    marketId:venue.marketId,venueId:venue.venueId,
    ticketStrategy:"STANDARD",eventType:"REGULAR",
    showSeriesId:weekly.seriesId});
   assert.equal(continued.status,"APPLIED",
    "Both managers must be able to plan their next real show after World progression");
   if(continued.status!=="APPLIED")throw new Error("Future show plan was not applied");
   const afterPlanning=await readSixWeekPlanner(db.pool,owner);
   const future=afterPlanning.weeks.find(w=>
    w.year===dueWeek.year&&w.week===dueWeek.week);
   assert.equal(future?.shows.filter(x=>
    x.draftId===continued.result.draftId).length,1,
    "The next show must survive in the player's six-week Planner");
   if(dueWeek.year===nextPlan.year&&dueWeek.week===nextPlan.week){
    const nextDraft=await readShowCardEditor(db.pool,{...owner,
     showId:continued.result.draftId});
    assert.equal(nextDraft.week,nextPlan.week);
    assert.equal(nextDraft.slots.length,0,
     "A new week's show cannot carry accidental previous match cards");
    assert.equal(nextDraft.canEdit,true);
   }else{
    await assert.rejects(readShowCardEditor(db.pool,{...owner,
     showId:continued.result.draftId}),/accessible|Current show/i,
     "Future shows stay in Planner; their card cannot be edited before its week");
   }
   readableResults.push({promotionId:owner.promotionId,
    showId:draft.draft_id,winner:bouts[0]!.matchContext!.winnerNames[0],
    nextWeek:nextPlan.week,nextScheduledWeek:dueWeek.week,
    nextDraftId:continued.result.draftId});
  }
  await assert.rejects(readCompletedShowView(db.pool,{
   worldId,playerId:state.drafts[0]!.player_id,
   promotionId:state.drafts[1]!.promotion_id,
   showId:state.drafts[1]!.draft_id
  }),/unavailable to this controller/,
   "Results from the competing human promotion must remain private");
  console.log(JSON.stringify({status:"AUTHENTIC_TWO_MANAGER_WEEK_PUBLISHED",
   promotionCount:13,wrestlers:643,confirmedHumanShows:state.drafts.length,
   completedShows:settled.completed,year:settled.world.year,
   nextWeek:settled.world.week,readableResults,stages}));
 }finally{await db.close();}
}
main().catch(error=>{
 console.error(error instanceof Error?error.message:"Authentic CI resolution failed");
 process.exitCode=1;
});
