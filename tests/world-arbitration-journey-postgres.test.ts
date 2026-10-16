import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution,planNextWorldResolutionAction}
 from "../src/db/world-resolution-pipeline.js";
import {previewWorldWeekArbitration} from "../src/db/week-arbitration.js";
import type {TransactionPool} from "../src/db/transaction.js";

const url=process.env.PPW_NEON_TEST_URL;

async function fixture(pool:TransactionPool,worldId:string,kind:"VENUE"|"WRESTLER"){
 const promotions=[0,1].map(i=>"promo-"+i+"-"+worldId);
 const shows=[0,1].map(i=>"show-"+i+"-"+worldId);
 const people=kind==="VENUE"
  ?[0,1,2,3].map(i=>"person-"+i+"-"+worldId)
  :["shared-"+worldId,"one-"+worldId,"two-"+worldId];
 const bookings=kind==="VENUE"?[[0,1],[2,3]]:[[0,1],[0,2]];
 const contracts=[0,1,2,3].map(i=>"contract-"+i+"-"+worldId);
 await withWorldTransaction(pool,async tx=>{
  await createWorld(tx,{id:worldId,name:"Arbitrated World",seed:979,rulesetVersion:"test"});
  for(let i=0;i<2;i++){
   await addPromotion(tx,worldId,{id:promotions[i]!,name:"Promotion "+i,tier:"LOCAL"});
   await tx.query("UPDATE ppw_promotions SET management_mode='AI',media_reach=70 WHERE world_id=$1 AND promotion_id=$2",
    [worldId,promotions[i]!]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,$3)",
    [worldId,"venue-"+i,"Venue "+i]);
  }
  await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0,next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[worldId]);
  for(const id of people)await tx.query(
   "INSERT INTO ppw_people(world_id,person_id,name,booking_division,weekly_service_capacity,in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum) VALUES($1,$2,'Talent','MEN',2,80,80,75,85,95,5,5,65,65,70)",
   [worldId,id]);
  for(let i=0;i<2;i++){
   const [a,b]=bookings[i]!;
   const personIds=[people[a]!,people[b]!];
   for(let j=0;j<2;j++)await tx.query(
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',1,52)",
    [worldId,contracts[i*2+j]!,personIds[j]!,promotions[i]!]);
   const venueId=kind==="VENUE"?"venue-0":"venue-"+i;
   await tx.query(
    "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance) VALUES($1,$2,$3,1,1,'SUBMITTED',3,$4,60)",
    [worldId,shows[i]!,promotions[i]!,venueId]);
   const booking={matchType:"SINGLES",participants:[
    {personId:personIds[0],contractId:contracts[i*2]},
    {personId:personIds[1],contractId:contracts[i*2+1]},
   ],scriptedWinner:personIds[1],plannedFinish:"SUBMISSION",
    plannedLengthMinutes:15,intent:"TECHNICAL"};
   await tx.query(
    "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb)",
    [worldId,shows[i]!,"match-"+i,JSON.stringify(booking)]);
  }
 });
 assert.equal((await lockWorldWeek(pool,{worldId,requestId:"lock",expectedRevision:0})).status,"APPLIED");
 const setup=await driveWorldResolution(pool,{worldId,resolutionId:"resolution-"+worldId,maxStages:3});
 assert.equal(setup.status,"LIMIT_REACHED");
 assert.deepEqual(setup.steps.map(s=>s.action),
  ["ASSESS_CONTINUITY","FINALIZE_PREPARED_SHOWS","BEGIN_RESOLUTION"]);
 return {promotions,shows,people,contracts};
}

async function cleanup(pool:TransactionPool,worldId:string){
 await withWorldTransaction(pool,async tx=>{
  for(const table of [
   "ppw_completed_match_evidence","ppw_completed_show_segments","ppw_completed_show_matches",
   "ppw_completed_shows","ppw_show_resolutions","ppw_week_resolution_seals",
   "ppw_week_resource_clearances","ppw_week_arbitration_proposals",
   "ppw_week_staff_fallback_runs","ppw_week_prepared_finalizations",
   "ppw_week_continuity_assessments","ppw_ledger_events","ppw_command_receipts",
   "ppw_booking_drafts","ppw_contracts","ppw_people","ppw_venues",
   "ppw_promotions","ppw_worlds",
  ]) await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
 });
}

test("AI venue claim is arbitrated, recovered and certified without rewriting booked winners",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),worldId="ai-arb-"+randomUUID();
 const resolutionId="resolution-"+worldId;
 try{
  const {shows,people}=await fixture(db.pool,worldId,"VENUE");
  assert.equal((await planNextWorldResolutionAction(db.pool,worldId)).action,
   "RECORD_ARBITRATION");
  const preview=await previewWorldWeekArbitration(db.pool,worldId);
  assert.equal(preview.outcomes.length,1);
  assert.equal(preview.outcomes[0]!.kind,"VENUE");
  const processed=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:8});
  assert.equal(processed.status,"PUBLISHED");
  assert.deepEqual(processed.steps.map(s=>s.action),[
   "RECORD_ARBITRATION","REMEDIATE_AI_CLAIM","CLEAR_RESOURCES",
   "RESOLVE_LEGACY_SHOWS","RESOLVE_DETAILED_SHOWS","CERTIFY_WEEK","PUBLISH_WEEK",
  ]);
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
   draft_id:string;show_day:number;venue_id:string;
  }>("SELECT draft_id,show_day,venue_id FROM ppw_booking_drafts WHERE world_id=$1 ORDER BY draft_id",[worldId]));
  assert.equal(rows.length,2);
  assert.notDeepEqual([rows[0]!.show_day,rows[0]!.venue_id],[rows[1]!.show_day,rows[1]!.venue_id]);
  const matches=await withWorldTransaction(db.pool,tx=>tx.query<{
   show_id:string;receipt_json:{matches:{actualWinnerSide:string}[]};
  }>("SELECT show_id,receipt_json FROM ppw_completed_shows WHERE world_id=$1",[worldId]));
  assert.equal(matches.length,2);
  assert.ok(matches.every(x=>x.receipt_json.matches[0]!.actualWinnerSide==="B"));
  assert.deepEqual(new Set(matches.map(x=>x.show_id)),new Set(shows));
  const final=await withWorldTransaction(db.pool,tx=>tx.query<{
   year:number;week:number;phase:string;
  }>("SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.deepEqual(final,[{year:1,week:2,phase:"OPEN"}]);
  const balances=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1",[worldId]));
  assert.deepEqual(balances.map(x=>x.remaining_dates),[0,0,0,0]);
  assert.equal(people.length,4);
  const ledger=await withWorldTransaction(db.pool,tx=>tx.query<{
   event_type:string;
  }>("SELECT event_type FROM ppw_ledger_events WHERE world_id=$1",[worldId]));
  assert.equal(ledger.filter(x=>x.event_type==="AI_BOOKING_REMEDIATED").length,1);
  assert.equal(ledger.filter(x=>x.event_type==="WORLD_WEEK_COMPLETED").length,1);
  assert.equal((await driveWorldResolution(db.pool,{worldId,resolutionId})).status,"BLOCKED");
 }finally{await cleanup(db.pool,worldId).finally(()=>db.close());}
});

test("human-controlled same-day wrestler loss blocks after deterministic proposal without charging dates",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),worldId="human-arb-"+randomUUID();
 const resolutionId="resolution-"+worldId;
 try{
  const {promotions,shows}=await fixture(db.pool,worldId,"WRESTLER");
  const preview=await previewWorldWeekArbitration(db.pool,worldId);
  assert.equal(preview.outcomes.length,1);
  assert.equal(preview.outcomes[0]!.kind,"WRESTLER");
  const denied=preview.outcomes[0]!.denied.promotionId;
  assert.ok(promotions.includes(denied));
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_promotions SET management_mode='HUMAN' WHERE world_id=$1 AND promotion_id=$2",
   [worldId,denied]));
  const resolved=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:8});
  assert.equal(resolved.status,"BLOCKED");
  assert.deepEqual(resolved.steps.map(s=>s.action),[
   "RECORD_ARBITRATION","ARBITRATE_OR_REMEDIATE",
  ]);
  assert.ok(resolved.blockers.includes("HUMAN_OR_CREATIVE_REBOOK_REQUIRED"));
  const state=await withWorldTransaction(db.pool,tx=>tx.query<{
   phase:string;year:number;week:number;
  }>("SELECT phase,year,week FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.deepEqual(state,[{phase:"RESOLVING",year:1,week:1}]);
  const dates=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1",[worldId]));
  assert.deepEqual(dates.map(x=>x.remaining_dates),[1,1,1,1]);
  const persisted=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_show_resolutions WHERE world_id=$1",[worldId]));
  assert.equal(persisted[0]!.n,"0");
  const script=await withWorldTransaction(db.pool,tx=>tx.query<{
   draft_id:string;payload:{scriptedWinner:string};
  }>("SELECT draft_id,payload FROM ppw_card_slots WHERE world_id=$1 ORDER BY draft_id",[worldId]));
  assert.deepEqual(new Set(script.map(x=>x.draft_id)),new Set(shows));
  assert.equal(script.length,2);
  assert.ok(script.every(x=>typeof x.payload.scriptedWinner==="string"));
  const again=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:8});
  assert.equal(again.status,"BLOCKED");
  assert.deepEqual(again.steps.map(s=>s.action),["ARBITRATE_OR_REMEDIATE"]);
 }finally{await cleanup(db.pool,worldId).finally(()=>db.close());}
});
