import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {setGorillaPolicy} from "../src/db/gorilla-position.js";
import {readCompletedShowArchive} from "../src/db/completed-show-archive.js";
import {readCompletedShowView} from "../src/db/show-results-view.js";
import {driveWorldResolution,planNextWorldResolutionAction}
 from "../src/db/world-resolution-pipeline.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";
import {resolveCanonicalShow} from "../src/db/resolve-canonical-show.js";
import {processWorldUpdate} from "../src/db/world-updating.js";

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
  // Canonical post-show medical consequences cannot retroactively
  // invalidate the completed match. An undocumented injury still blocks.
  const detailed=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:1});
  assert.equal(detailed.status,"LIMIT_REACHED");
  assert.deepEqual(detailed.steps.map(s=>s.action),["RESOLVE_DETAILED_SHOWS"]);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_people SET status='INJURED' WHERE world_id=$1 AND person_id=$2",
   [worldId,people[0]!]));
  const undocumented=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
  assert.ok(undocumented.blockers.some(b=>
   b.code==="WRESTLER_UNAVAILABLE"&&b.resourceId===people[0]),
   "An undocumented injury remains a hard blocker");
  await withWorldTransaction(db.pool,tx=>tx.query(`
    INSERT INTO ppw_medical_absences
    (world_id,person_id,show_id,match_id,injured_week_index,
     cleared_week_index,weeks_out,severity,status)
    VALUES ($1,$2,$3,'main-event-0',0,5,5,'MODERATE','ACTIVE')`,
   [worldId,people[0]!,shows[0]!]));
  const verified=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
  assert.equal(verified.provisionalClear,true,
   "Newly injured wrestler from this completed show must not block certification");
  const resumed=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:4});
  assert.equal(resumed.status,"PUBLISHED");
  assert.deepEqual(resumed.steps.map(s=>s.action),["CERTIFY_WEEK","PUBLISH_WEEK"]);
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
    "ppw_wrestler_relationship_changes","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationships",
    "ppw_medical_absences","ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_individual_field_career_effects","ppw_tag_match_career_effects",
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

/** Regression: the calendar's premium event is a genuinely separate show,
 * not a second name on television or a second World Lock. */
test("a recorded regular card resumes into a linked triple-threat PPV, then queues both editorial jobs once",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID(),worldId="dual-journey-"+id;
 const resolutionId="resolution-dual-"+id,promotions=["host-"+id,"visitor-"+id];
 const playerId="producer-"+id;
 const showIds=["television-"+id,"premium-"+id,"rival-"+id];
 const persons=Array.from({length:7},(_,i)=>"wrestler-"+i+"-"+id);
 const contractIds=persons.map((_,i)=>"contract-"+i+"-"+id);
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Premium Journey",seed:125,rulesetVersion:"test"});
   for(let i=0;i<2;i++){
    await addPromotion(tx,worldId,{id:promotions[i]!,name:"Promotion "+i,tier:"LOCAL"});
    await tx.query("UPDATE ppw_promotions SET media_reach=70 WHERE world_id=$1 AND promotion_id=$2",
     [worldId,promotions[i]!]);
   }
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,promotions[0]!]);
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[worldId]);
   for(let i=0;i<3;i++)await tx.query(
    "INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,$3)",
    [worldId,"dual-venue-"+i,"Arena "+i]);
   for(let i=0;i<persons.length;i++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum,default_alignment) VALUES($1,$2,$3,'MEN',80,80,75,85,95,5,5,65,65,70,'FACE')",
     [worldId,persons[i]!,"Wrestler "+i]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',1,52)",
     [worldId,contractIds[i]!,persons[i]!,promotions[i===4||i===5?1:0]!]);
   }
   for(let i=0;i<3;i++){
    const promotionId=promotions[i===2?1:0]!;
    const bookingClass=i===1?"PREMIUM":"REGULAR";
    await tx.query(
     "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance,event_type,booking_class,show_series_id,show_name) VALUES($1,$2,$3,1,1,'SUBMITTED',$4,$5,$6,$7,$8,$9,$10)",
     [worldId,showIds[i]!,promotionId,i+2,"dual-venue-"+i,i===1?99:65,
      i===1?"MAJOR":"REGULAR",bookingClass,i===1?"calendar-default-ppv-royal-rumble":null,
      i===1?"Royal Rumble":i===0?"Monday Night Raw":"Visitor Wrestling"]);
    const a=i*2,b=a+1;
    const participants=[a,b,...(i===1?[6]:[])].map(j=>({
     personId:persons[j]!,contractId:contractIds[j]!}));
    const payload=i===1?{
     matchType:"SINGLES",family:"INDIVIDUAL",
     sides:participants.map((p,j)=>({sideId:String.fromCharCode(65+j),participants:[p]})),
     participants,scriptedWinner:persons[6],scriptedWinnerSide:"C",
     intent:"COMPETITIVE",plannedLengthMinutes:25,plannedFinish:"CLEAN_PIN",
    }:{matchType:"SINGLES",participants,scriptedWinner:persons[b],intent:"TECHNICAL",
     plannedLengthMinutes:15,plannedFinish:"SUBMISSION"};
    await tx.query(
     "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb)",
     [worldId,showIds[i]!,"match-"+i,JSON.stringify(payload)]);
    if(i===1){
     await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition,programme_format) VALUES($1,$2,'solo-title','ACTIVE',50,0,'SOLO')",[worldId,promotionId]);
     await tx.query("INSERT INTO ppw_programme_participants(world_id,promotion_id,programme_id,person_id,side) VALUES($1,$2,'solo-title',$3,'A')",[worldId,promotionId,persons[6]]);
     await tx.query("INSERT INTO ppw_programme_match_activities(world_id,promotion_id,programme_id,draft_id,slot_id,kind) VALUES($1,$2,'solo-title',$3,'match-1','MATCH')",[worldId,promotionId,showIds[i]]);
    }
   }
  });
  const instruction=await setGorillaPolicy(db.pool,{
   worldId,promotionId:promotions[0]!,playerId,requestId:"policy-before-lock",
   expectedRevision:0,policy:"FOLLOW_THE_CROWD"});
  assert.equal(instruction.status,"APPLIED");
  assert.equal((await setGorillaPolicy(db.pool,{
   worldId,promotionId:promotions[0]!,playerId,requestId:"policy-before-lock",
   expectedRevision:0,policy:"FOLLOW_THE_CROWD"})).status,"REPLAYED");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[worldId]));
  assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:1})).status,"APPLIED");
  // Reproduce the live recovery boundary: the whole week's contract
  // accounting has already committed, and television is certified while
  // the premium card still awaits its detailed settlement.
  const prepared=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:5});
  assert.equal(prepared.status,"LIMIT_REACHED");
  assert.deepEqual(prepared.steps.map(s=>s.action),[
   "ASSESS_CONTINUITY","FINALIZE_PREPARED_SHOWS","BEGIN_RESOLUTION",
   "CLEAR_RESOURCES","RESOLVE_LEGACY_SHOWS"]);
  const tv={worldId,promotionId:promotions[0]!,showId:showIds[0]!,
   year:1,week:1,resolutionId};
  assert.equal(await resolveCanonicalShow(db.pool,tv),"RECORDED");
  const before=await read<{show_id:string;receipt_digest:string}>(
   "SELECT show_id,receipt_digest FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
  assert.equal(before.length,1);
  assert.equal(before[0]!.show_id,showIds[0]);
  const stages=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:12,manualRecovery:true,deferEditorial:true});
  assert.equal(stages.status,"PUBLISHED");
  assert.deepEqual(stages.steps.map(s=>s.action),[
   "RESOLVE_DETAILED_SHOWS","CERTIFY_WEEK","PUBLISH_WEEK"]);
  assert.deepEqual(await read<{show_id:string;receipt_digest:string}>(
   "SELECT show_id,receipt_digest FROM ppw_completed_shows WHERE world_id=$1 AND show_id=$2",
   [worldId,showIds[0]]),before,"Resuming the PPV must preserve the earlier certified TV receipt");
  assert.deepEqual(await read("SELECT phase FROM ppw_worlds WHERE world_id=$1",[worldId]),[{phase:"UPDATING"}]);
  assert.deepEqual(await read("SELECT show_id,state FROM ppw_world_update_jobs WHERE world_id=$1 ORDER BY show_day",[worldId]),
   [{show_id:showIds[0],state:"WAITING"},{show_id:showIds[1],state:"WAITING"}]);
  const outgoing={worldId,year:1,week:1};
  const reservations:string[]=[],refunds:string[]=[],calls:string[]=[];
  const transport:typeof fetch=async url=>{
   calls.push(String(url));
   return new Response("Abandoned request reached transport",{status:503});
  };
  const deps={terraKey:"mock",groqKey:"mock",transport};
  // Pause the real editorial workers during context reads, after their
  // nested claims have committed. Usage writes are isolated from the global
  // allowance fixtures running in other test processes.
  const pausedPool=(matches:(sql:string)=>boolean)=>{
   let enter!:()=>void,resume!:()=>void;
   const entered=new Promise<void>(resolve=>{enter=resolve;});
   const hold=new Promise<void>(resolve=>{resume=resolve;});
   const pool:TransactionPool={async connect(){
    const client=await db.pool.connect();
    return {release:()=>client.release(),async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     if(matches(sql)){enter();await hold;}
     for(const [table,receipt] of [
      ["ppw_groq_dispatch_gate",{id:1}],["ppw_groq_daily_usage",{day:"2026-11-26"}],
      ["ppw_openai_preview_monthly_usage",{month:"2026-11-01"}],
      ["ppw_openai_preview_daily_usage",{day:"2026-11-26"}]
     ] as const){
      if(sql.includes(table)){
       if(sql.includes("INSERT INTO")){reservations.push(table);return [receipt] as unknown as T[];}
       if(sql.includes("call_count=GREATEST(0,call_count-1)"))refunds.push(table);
       return [];
      }
     }
     return client.query<T>(sql,params);
    }};
   }};
   return {pool,entered,resume};
  };
  const privateWorker=pausedPool(sql=>sql.includes("SELECT old.promotion_id,old.year,old.week"));
  const publicWorker=pausedPool(sql=>sql.includes("WITH ranked AS")&&sql.includes("FROM ppw_world_news_items i"));
  const reservedWorker=pausedPool(sql=>sql.includes("SELECT 1 FROM ppw_world_update_jobs j")&&
   sql.includes("r.claim_until>clock_timestamp()")&&!sql.includes("FOR UPDATE"));
  const privateRun=processWorldUpdate(privateWorker.pool,outgoing,deps);
  let publicRun:ReturnType<typeof processWorldUpdate>|undefined;
  let reservedRun:ReturnType<typeof processWorldUpdate>|undefined;
  const settlement=async()=>read(`SELECT
   (SELECT count(*)::integer FROM ppw_week_resolution_seals WHERE world_id=$1) AS seals,
   (SELECT count(*)::integer FROM ppw_world_news_weeks WHERE world_id=$1) AS editions,
   (SELECT count(*)::integer FROM ppw_world_update_runs WHERE world_id=$1 AND state='COMPLETE') AS closed_runs,
   (SELECT sum(dates_charged)::integer FROM ppw_show_resolutions WHERE world_id=$1) AS dates,
   (SELECT jsonb_object_agg(promotion_id,cash) FROM ppw_promotions WHERE world_id=$1) AS cash,
   (SELECT count(*)::integer FROM ppw_ledger_events WHERE world_id=$1) AS ledger_entries,
   (SELECT revision::text FROM ppw_worlds WHERE world_id=$1) AS revision`,[worldId]);
  try{
   await Promise.race([privateWorker.entered,privateRun.then(()=>assert.fail("Private claim did not reach history preparation"))]);
   assert.deepEqual(await read("SELECT state FROM ppw_ringside_reports WHERE world_id=$1",[worldId]),[{state:"PENDING"}]);
   await read(`UPDATE ppw_world_update_jobs SET claim_until=clock_timestamp()-interval '1 second'
    WHERE world_id=$1 AND show_id=$2`,[worldId,showIds[0]]);
   assert.equal((await processWorldUpdate(db.pool,outgoing,{}))?.editorial?.state,"FALLBACK");
   assert.deepEqual({reservations,calls},{reservations:[],calls:[]});
   // Recovery can also happen after a valid reservation while the worker
   // awaits its final check. Both unused allowances should be returned.
   reservedRun=processWorldUpdate(reservedWorker.pool,outgoing,deps);
   await Promise.race([reservedWorker.entered,reservedRun.then(()=>assert.fail("PPV claim did not reach final dispatch check"))]);
   const reserved=["ppw_openai_preview_monthly_usage","ppw_openai_preview_daily_usage"];
   assert.deepEqual(reservations,reserved);
   assert.deepEqual(calls,[]);
   await read(`UPDATE ppw_world_update_jobs SET claim_until=clock_timestamp()-interval '1 second'
    WHERE world_id=$1 AND show_id=$2`,[worldId,showIds[1]]);
   assert.equal((await processWorldUpdate(db.pool,outgoing,{}))?.editorial?.state,"FALLBACK");
   publicRun=processWorldUpdate(publicWorker.pool,outgoing,deps);
   await Promise.race([publicWorker.entered,publicRun.then(()=>assert.fail("Public claim did not reach story preparation"))]);
   assert.deepEqual(await read("SELECT state FROM ppw_weekly_world_editorial WHERE world_id=$1",[worldId]),[{state:"PENDING"}]);
   await read(`UPDATE ppw_world_update_runs SET public_claim_until=clock_timestamp()-interval '1 second'
    WHERE world_id=$1`,[worldId]);
   const recovered=await processWorldUpdate(db.pool,outgoing,{});
   assert.equal(recovered?.status,"PUBLISHED");
   assert.equal(recovered?.editorial?.state,"FALLBACK");
   assert.deepEqual(await read("SELECT week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]),[{week:2,phase:"OPEN"}]);
   const settled=await settlement();
   assert.deepEqual(settled.map(({seals,editions,closed_runs,dates})=>({seals,editions,closed_runs,dates})),
    [{seals:1,editions:1,closed_runs:1,dates:7}]);
   privateWorker.resume();publicWorker.resume();reservedWorker.resume();
   await Promise.all([privateRun,publicRun,reservedRun]);
   assert.deepEqual(reservations,reserved);
   assert.deepEqual(refunds,reserved);
   assert.deepEqual(calls,[]);
   assert.deepEqual(await read("SELECT state,report_json FROM ppw_ringside_reports WHERE world_id=$1",[worldId]),
    [{state:"FAILED",report_json:null},{state:"FAILED",report_json:null}]);
   assert.deepEqual(await read("SELECT state,diagnostic,copy_json,provider_calls FROM ppw_weekly_world_editorial WHERE world_id=$1",[worldId]),
    [{state:"FAILED",diagnostic:"INTERRUPTED",copy_json:null,provider_calls:0}]);
   assert.equal((await processWorldUpdate(db.pool,outgoing,deps))?.status,"PUBLISHED");
   assert.deepEqual(await settlement(),settled);
  }finally{
   privateWorker.resume();publicWorker.resume();reservedWorker.resume();
   await Promise.allSettled([privateRun,publicRun,reservedRun]);
  }
  const dates=await read<{show_id:string;dates_charged:number}>(
   "SELECT show_id,dates_charged FROM ppw_show_resolutions WHERE world_id=$1 ORDER BY show_id",[worldId]);
  assert.equal(dates.length,3);
  assert.ok(dates.every(x=>x.dates_charged===(x.show_id===showIds[1]?3:2)));
  const results=await read<{show_id:string;receipt_json:{matches:unknown[]}}>(
   "SELECT show_id,receipt_json FROM ppw_completed_shows WHERE world_id=$1 ORDER BY show_id",[worldId]);
  assert.deepEqual(results.map(x=>x.show_id).sort(),[...showIds].sort());
  assert.ok(results.every(x=>x.receipt_json.matches.length===1));
  const archive=await readCompletedShowArchive(db.pool,{worldId,playerId,
   promotionId:promotions[0]!});
  assert.equal(archive.items.length,2);
  assert.deepEqual(archive.items.map(x=>x.showName).sort(),
   ["Monday Night Raw","Royal Rumble"]);
  const ppvView=await readCompletedShowView(db.pool,{worldId,playerId,
   promotionId:promotions[0]!,showId:showIds[1]!});
  assert.equal(ppvView.showName,"Royal Rumble");
  assert.equal(ppvView.bookingClass,"PREMIUM");
  const story=await read<{match_count:number;side_a_wins:number;side_b_wins:number;draws:number}>(
   "SELECT match_count,side_a_wins,side_b_wins,draws FROM ppw_programmes WHERE world_id=$1 AND programme_id='solo-title'",[worldId]);
  assert.deepEqual(story,[{match_count:1,side_a_wins:1,side_b_wins:0,draws:0}]);
  assert.deepEqual(await read<{winner_side:string}>(
   "SELECT winner_side FROM ppw_programme_resolved_activities WHERE world_id=$1 AND programme_id='solo-title'",[worldId]),[{winner_side:"A"}]);
  assert.deepEqual(await read<{actual_winner_side:string}>(
   "SELECT actual_winner_side FROM ppw_completed_show_matches WHERE world_id=$1 AND show_id=$2",[worldId,showIds[1]]),[{actual_winner_side:"C"}]);
  assert.equal(ppvView.gorillaLog?.policy,"FOLLOW_THE_CROWD");
  assert.equal(ppvView.gorillaLog?.crowdAfter,ppvView.crowdResponse);
  const logs=await read<{show_id:string;policy:string;
   log_json:{crowdAdjustment:number;incidents:unknown[]}}>(
    "SELECT show_id,policy,log_json FROM ppw_gorilla_show_logs WHERE world_id=$1 ORDER BY show_id",
    [worldId]);
  assert.deepEqual(logs.map(x=>x.show_id).sort(),[showIds[0]!,showIds[1]!].sort(),
   "Both player-authored shows get exactly one Gorilla log; AI opponent does not");
  assert.ok(logs.every(x=>x.policy==="FOLLOW_THE_CROWD"&&
   x.log_json.crowdAdjustment>=0&&x.log_json.crowdAdjustment<=1));
  const contractBalances=await read<{remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId]);
  assert.ok(contractBalances.every(x=>x.remaining_dates===0));
  const week=await read<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]);
  assert.deepEqual(week,[{year:1,week:2,phase:"OPEN"}]);
  assert.deepEqual(await read<{certified_promotions:number}>(
   "SELECT certified_promotions FROM ppw_week_resolution_seals WHERE world_id=$1",[worldId]),
   [{certified_promotions:2}]);
  const retry=await driveWorldResolution(db.pool,{worldId,resolutionId,maxStages:2});
  assert.equal(retry.status,"BLOCKED");
  assert.equal((await read<{total:number}>(
   "SELECT count(*)::integer AS total FROM ppw_completed_shows WHERE world_id=$1",[worldId]))[0]!.total,3);
  assert.equal((await read<{n:number}>(
   "SELECT count(*)::integer AS n FROM ppw_gorilla_show_logs WHERE world_id=$1",
   [worldId]))[0]!.n,2,"Replay never adds a second incident log");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ringside_reports","ppw_weekly_world_editorial","ppw_world_update_jobs","ppw_world_update_runs","ppw_programme_resolved_activities",
    "ppw_wrestler_relationship_changes","ppw_tag_working_pair_appearances",
    "ppw_wrestler_relationships","ppw_completed_match_evidence",
    "ppw_completed_show_segments",
    "ppw_individual_field_career_effects","ppw_tag_match_career_effects",
    "ppw_completed_show_matches",
    // Real match medical absences reference completed shows: delete these
    // within the disposable World before removing their parent receipts.
    "ppw_medical_absences",
    "ppw_gorilla_show_logs","ppw_completed_shows","ppw_gorilla_policies","ppw_show_resolutions","ppw_week_resolution_seals",
    "ppw_week_resource_clearances","ppw_week_prepared_finalizations",
    "ppw_week_continuity_assessments","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_alignment_changes","ppw_programme_match_activities",
    "ppw_programme_participants","ppw_programmes","ppw_card_slots",
    "ppw_booking_drafts","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
  }).finally(()=>db.close());
 }
});
