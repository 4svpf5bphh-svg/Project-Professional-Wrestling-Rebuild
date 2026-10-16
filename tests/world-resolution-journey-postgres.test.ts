import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution,planNextWorldResolutionAction}
 from "../src/db/world-resolution-pipeline.js";

const url=process.env.PPW_NEON_TEST_URL;

/** A real PostgreSQL World across the complete resolver. No fabricated
 * receipts, mocks, manually approved resource clearance, or running cron.
 * Stop after contract-date accounting and restart with durable checkpoints.
 */
test("two promotions resolve, certify and publish after restart without double charges",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID(),worldId="journey-"+id;
 const promotions=["promo-a-"+id,"promo-b-"+id];
 const shows=["show-a-"+id,"show-b-"+id];
 const people=[0,1,2,3].map(i=>"person-"+i+"-"+id);
 const contracts=people.map((_,i)=>"contract-"+i+"-"+id);
 const resolutionId="resolution-"+id;
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Resolution Journey",seed:808,rulesetVersion:"test"});
   for(let i=0;i<2;i++){
    await addPromotion(tx,worldId,{id:promotions[i]!,name:"Promotion "+i,tier:"LOCAL"});
    await tx.query("UPDATE ppw_promotions SET media_reach=70 WHERE world_id=$1 AND promotion_id=$2",
     [worldId,promotions[i]!]);
    await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,$3)",
     [worldId,"venue-"+i,"Venue "+i]);
   }
   // Make original match simulation ready without guessing any real wrestler attributes.
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[worldId]);
   for(let i=0;i<4;i++){
    await tx.query("INSERT INTO ppw_people (world_id,person_id,name,booking_division,in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum) VALUES($1,$2,$3,'MEN',80,80,75,85,95,5,5,65,65,70)",
     [worldId,people[i]!,"Talent "+i]);
    await tx.query("INSERT INTO ppw_contracts (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',1,52)",
     [worldId,contracts[i]!,people[i]!,promotions[Math.floor(i/2)]!]);
   }
   for(let i=0;i<2;i++){
    await tx.query("INSERT INTO ppw_booking_drafts (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance) VALUES($1,$2,$3,1,1,'SUBMITTED',$4,$5,60)",
     [worldId,shows[i]!,promotions[i]!,i+2,"venue-"+i]);
    const a=i*2,b=a+1;
    const booking={matchType:"SINGLES",participants:[
     {personId:people[a],contractId:contracts[a]},
     {personId:people[b],contractId:contracts[b]},
    ],scriptedWinner:people[b],intent:"TECHNICAL",plannedLengthMinutes:15,
     plannedFinish:"SUBMISSION"};
    await tx.query("INSERT INTO ppw_card_slots (world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb)",
     [worldId,shows[i]!,"main-event-"+i,JSON.stringify(booking)]);
   }
   // Only this disposable World clock is advanced; no background scheduler.
   await tx.query("UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
    [worldId]);
  });
  assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:0})).status,"APPLIED");
  const prepared=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:4});
  assert.equal(prepared.status,"LIMIT_REACHED");
  assert.deepEqual(prepared.steps.map(s=>s.action),[
   "ASSESS_CONTINUITY","FINALIZE_PREPARED_SHOWS","BEGIN_RESOLUTION","CLEAR_RESOURCES",
  ]);
  assert.equal((await planNextWorldResolutionAction(db.pool,worldId)).action,"RESOLVE_LEGACY_SHOWS");
  // Simulate process restart between contract accounting and show simulation.
  const interrupted=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:1});
  assert.equal(interrupted.status,"LIMIT_REACHED");
  assert.deepEqual(interrupted.steps.map(s=>s.action),["RESOLVE_LEGACY_SHOWS"]);
  assert.deepEqual((await read<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId]
  )).map(x=>x.remaining_dates),[0,0,0,0]);
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_completed_shows WHERE world_id=$1",[worldId]
  ))[0]!.n,"0");
  const resumed=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:4});
  assert.equal(resumed.status,"PUBLISHED");
  assert.deepEqual(resumed.steps.map(s=>s.action),[
   "RESOLVE_DETAILED_SHOWS","CERTIFY_WEEK","PUBLISH_WEEK",
  ]);
  const clock=await read<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]);
  assert.deepEqual(clock,[{year:1,week:2,phase:"OPEN"}]);
  assert.deepEqual(await read<{certified_promotions:number}>(
   "SELECT certified_promotions FROM ppw_week_resolution_seals WHERE world_id=$1",[worldId]
  ),[{certified_promotions:2}]);
  const results=await read<{receipt_json:{matches:{actualWinnerSide:string}[]}}>(
   "SELECT receipt_json FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
  assert.equal(results.length,2);
  assert.ok(results.every(r=>r.receipt_json.matches.length===1));
  assert.ok(results.every(r=>r.receipt_json.matches[0]!.actualWinnerSide==="B"));
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_show_resolutions WHERE world_id=$1",[worldId]
  ))[0]!.n,"2");
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_ledger_events WHERE world_id=$1 AND event_type='WORLD_WEEK_COMPLETED'",[worldId]
  ))[0]!.n,"1");
  const retry=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:4});
  assert.equal(retry.status,"BLOCKED");
  assert.deepEqual(retry.steps.map(s=>s.action),["WAIT_FOR_WORLD_LOCK"]);
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_completed_shows WHERE world_id=$1",[worldId]
  ))[0]!.n,"2");
  assert.deepEqual((await read<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId]
  )).map(x=>x.remaining_dates),[0,0,0,0]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_ledger_events","ppw_command_receipts","ppw_booking_drafts",
    "ppw_contracts","ppw_people","ppw_venues","ppw_promotions","ppw_worlds",
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
