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
    await tx.query("INSERT INTO ppw_people (world_id,person_id,name,booking_division,in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum,default_alignment) VALUES($1,$2,$3,'MEN',80,80,75,85,95,5,5,65,65,70,'FACE')",
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
    const angle={kind:i===0?"ATTACK":"PROMO",
     participants:i===0?booking.participants:[booking.participants[0]],
     actorIds:[people[a]],targetIds:i===0?[people[b]]:[],
     outcome:i===0?"HAPPENS":"REFUSED"};
    await tx.query("INSERT INTO ppw_card_slots (world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,1,'SEGMENT',$4::jsonb)",
     [worldId,shows[i]!,"angle-"+i,JSON.stringify(angle)]);
    if(i===0){
     // A player-authored heel turn must survive resolution and alter portable identity.
     await tx.query("INSERT INTO ppw_card_slots (world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'turn-0',2,'SEGMENT',$3::jsonb)",
      [worldId,shows[i]!,JSON.stringify({kind:"TURN",participants:[booking.participants[0]],
       actorIds:[people[a]],targetIds:[],outcome:"HAPPENS",turnTargetAlignment:"HEEL"})]);
     await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition) VALUES($1,$2,'feud','ACTIVE',50,0)",
      [worldId,promotions[i]]);
     await tx.query("INSERT INTO ppw_programme_participants(world_id,promotion_id,programme_id,person_id,side) VALUES ($1,$2,'feud',$3,'A'),($1,$2,'feud',$4,'B')",
      [worldId,promotions[i],people[a],people[b]]);
     await tx.query("INSERT INTO ppw_programme_match_activities(world_id,promotion_id,programme_id,draft_id,slot_id,kind) VALUES($1,$2,'feud',$3,'angle-0','SEGMENT'),($1,$2,'feud',$3,'main-event-0','MATCH')",
      [worldId,promotions[i],shows[i]]);
    }
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
  const results=await read<{receipt_json:{matches:{actualWinnerSide:string}[];segments:{outcome:string}[]}}>(
   "SELECT receipt_json FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
  assert.equal(results.length,2);
  assert.ok(results.every(r=>r.receipt_json.matches.length===1));
  assert.ok(results.every(r=>r.receipt_json.matches[0]!.actualWinnerSide==="B"));
  assert.deepEqual(results.map(r=>r.receipt_json.segments.length).sort(),[1,2]);
  const angleStories=await read<{slot_id:string;authored_outcome:string;
   story_json:{headline:string;summary:string;intent:string|null;actorIds:string[]}}>(`
   SELECT slot_id,authored_outcome,story_json FROM ppw_completed_show_segments
   WHERE world_id=$1 ORDER BY slot_id`,[worldId]);
  assert.equal(angleStories.length,3);
  assert.deepEqual(angleStories.map(s=>s.authored_outcome),["HAPPENS","REFUSED","HAPPENS"]);
  assert.equal(angleStories[2]!.story_json.intent,"TURN_OCCURRED");
  assert.match(angleStories[2]!.story_json.summary,/heel/);
  assert.equal(angleStories[0]!.story_json.intent,"ATTACK_OCCURRED");
  assert.match(angleStories[0]!.story_json.summary,/attacks/);
  assert.equal(angleStories[1]!.story_json.intent,null);
  assert.match(angleStories[1]!.story_json.summary,/does not happen/);
  const turned=await read<{default_alignment:string}>(`
   SELECT default_alignment FROM ppw_people WHERE world_id=$1 AND person_id=$2`,
   [worldId,people[0]!]);
  assert.equal(turned[0]!.default_alignment,"HEEL");
  const changes=await read<{method:string;changed:boolean}>(`
   SELECT method,changed FROM ppw_promotion_alignment_changes WHERE world_id=$1`,
   [worldId]);
  assert.deepEqual(changes,[{method:"TURN",changed:true}]);
  const programmes=await read<{heat:number;repetition:number}>(`
   SELECT heat,repetition FROM ppw_programmes
   WHERE world_id=$1 AND promotion_id=$2`,[worldId,promotions[0]!]);
  assert.equal(programmes.length,1);
  assert.equal(programmes[0]!.repetition,6,"Same-week match and angle apply original activity-density pressure");
  assert.ok(programmes[0]!.heat>50);
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
  const finalProgramme=await read<{repetition:number}>(
   "SELECT repetition FROM ppw_programmes WHERE world_id=$1 AND promotion_id=$2",
   [worldId,promotions[0]!]);
  assert.equal(finalProgramme[0]!.repetition,6,"World retry must never double-apply match and angle activity");
  const activity=await read<{kind:string;week_index:number;signature:string}>(
   "SELECT kind,week_index,signature FROM ppw_programme_resolved_activities WHERE world_id=$1",
   [worldId]);
  assert.equal(activity.length,2);
  assert.deepEqual(activity.map(x=>x.kind).sort(),["MATCH","SEGMENT"]);
  const totals=await read<{activity_count:number;match_count:number;
   segment_count:number;side_a_wins:number;side_b_wins:number;draws:number}>(`
   SELECT activity_count,match_count,segment_count,side_a_wins,side_b_wins,draws
   FROM ppw_programmes WHERE world_id=$1 AND programme_id='feud'`,[worldId]);
  assert.deepEqual(totals,[{activity_count:2,match_count:1,
   segment_count:1,side_a_wins:0,side_b_wins:1,draws:0}]);
  assert.deepEqual((await read<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId]
  )).map(x=>x.remaining_dates),[0,0,0,0]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_programme_resolved_activities",
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_alignment_changes",
    "ppw_programme_match_activities","ppw_programme_participants","ppw_programmes","ppw_card_slots","ppw_booking_drafts",
    "ppw_contracts","ppw_people","ppw_venues","ppw_promotions","ppw_worlds",
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
