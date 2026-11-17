import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {advancePlaytestWeek} from "../src/db/manual-playtest-week.js";
import {readSixWeekPlanner,saveCreativeOutline} from "../src/db/planner-workspace.js";
import {buildSixWeekProduction} from "../src/domain/six-week-production-board.js";
import {startProgramme,readProgrammeWorkspace,chooseProgrammeFinale}
 from "../src/db/programme-workspace.js";
import {saveCardEditorAsActor,markPreparedShowReadyAsActor}
 from "../src/api/world-service.js";

const url=process.env.PPW_NEON_TEST_URL;

/** A real pre-authored six-week TV build ending in a Week 6 PPV.
 * Owner prepares all seven cards BEFORE World week one is resolved, does
 * not log in or change any card between locks, and sees certified outcomes.
 * This is a disposable PostgreSQL World, not production or automatic cron.
 */
test("owner-authored six-week rivalry builds to a certified PPV finale without daily visits",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),worldId="phase53d-"+suffix,
  playerId="owner-"+suffix,promotionId="cwa-"+suffix,
  venueId="arena-"+suffix;
 const people=Array.from({length:4},(_,i)=>"person-"+i+"-"+suffix);
 const contracts=people.map((_,i)=>"contract-"+i+"-"+suffix);
 const db=postgresPool(url!,4);
 const read=<T extends Record<string,unknown>>(sql:string,args:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,args));
 const revision=async()=>Number((await read<{revision:number|string}>(
  "SELECT revision FROM ppw_worlds WHERE world_id=$1",[worldId]))[0]!.revision);
 const scope={worldId,promotionId,playerId};
 const context={pool:db.pool,actor:{playerId}};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Advance PPV Booking",seed:5304,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,"+
    "audience_potential,wrestling_interest,spending_index)"+
    " VALUES($1,'home','Home Market',65,75,95)",[worldId]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id)"+
    " VALUES($1,$2,'CWA Arena','home')",[worldId,venueId]);
   await tx.query(`INSERT INTO ppw_show_series(world_id,promotion_id,series_id,
    name,role,event_type,cadence_weeks,anchor_week,importance) VALUES
    ($1,$2,'flagship','CWA Weekly','FLAGSHIP','REGULAR',1,0,70),
    ($1,$2,'ppv','Spring Riot','PREMIUM','MAJOR',52,5,90)`,
    [worldId,promotionId]);
   for(let i=0;i<4;i++){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,
     booking_division,in_ring_quality,match_craft,presentation,stamina,safety,
     fatigue,wear,popularity,recognition,momentum,default_alignment)
     VALUES($1,$2,$3,'MEN',83,81,76,88,98,5,4,61,62,65,'FACE')`,
     [worldId,people[i],"Wrestler "+i]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,
     promotion_id,family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',12,52)`,
     [worldId,contracts[i],people[i],promotionId]);
   }
   for(let week=1;week<=6;week++){
    const showId="tv-"+week;
    await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,
     promotion_id,year,week,status,show_day,venue_id,market_id,booking_class,event_type,
     show_name,show_series_id,event_importance)
     VALUES($1,$2,$3,1,$4,$6,5,$5,'home','REGULAR','REGULAR',
     'CWA Weekly','flagship',70)`,[worldId,showId,promotionId,week,venueId,
     [1,3,5].includes(week)?"DRAFT":"SUBMITTED"]);
    if(![1,3,5].includes(week))await tx.query(`
     INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,
     position,kind,payload) VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,
     [worldId,showId,JSON.stringify({matchType:"SINGLES",
      participants:[2,3].map(i=>({
       personId:people[i],contractId:contracts[i]})),
      scriptedWinner:people[week%2===0?2:3],intent:"TECHNICAL",
      plannedLengthMinutes:15,plannedFinish:"CLEAN_PIN"})]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
    year,week,status,show_day,venue_id,market_id,booking_class,event_type,show_name,
    show_series_id,event_importance)
    VALUES($1,'spring-riot',$2,1,6,'DRAFT',7,$3,'home','PREMIUM','MAJOR',
     'Spring Riot','ppv',90)`,[worldId,promotionId,venueId]);
  });

  // The real controlled manager starts a feud, authors three future TV
  // chapters plus an independent premium-event payoff, and confirms every
  // actual card before Week 1 resolves. There is no intervening manager login.
  const begun=await startProgramme(db.pool,{...scope,requestId:"start-feud",
   expectedRevision:await revision(),
   sideA:[{kind:"PERSON",refId:people[0]!}],
   sideB:[{kind:"PERSON",refId:people[1]!}]});
  assert.equal(begun.status,"APPLIED");
  if(begun.status!=="APPLIED")throw Error("Manager could not create Programme");
  const programmeId=begun.result.programmeId;
  const participants=[0,1].map(i=>({personId:people[i]!,contractId:contracts[i]!}));
  const match=(winner:"A"|"B")=>({
   matchType:"SINGLES" as const,family:"INDIVIDUAL" as const,
   sides:[{sideId:"A" as const,participants:[participants[0]!] },
    {sideId:"B" as const,participants:[participants[1]!]}],
   participants,scriptedWinnerSide:winner,plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:17
  });
  const assault={kind:"ATTACK",participants,actorIds:[people[0]!],
   targetIds:[people[1]!],outcome:"HAPPENS",durationMinutes:5,
   scene:{location:"BACKSTAGE",visual:"OFFICIALS_SEPARATE",
    purpose:"BUILD_RIVALRY",intensity:"BEATDOWN"},
   creativeBeat:{kind:"ATTACK",presentation:"PREMEDITATED_AMBUSH",
    objective:"ESCALATE_RIVALRY"}};
  for(const week of [1,3,5]){
   const showId="tv-"+week;
   const saved=await saveCardEditorAsActor(context,{...scope,showId,
    requestId:"chapter-"+week,expectedRevision:await revision(),
    matches:[{slotId:"main",payload:match(week===1?"B":"A")}],
    segments:[{slotId:"aftermath",payload:assault,programmeId}],
    runningOrder:["main","aftermath"]});
   assert.equal(saved.status,"APPLIED","Manager must save the actual Week "+week+" chapter");
   const confirmed=await markPreparedShowReadyAsActor(context,{...scope,showId,
    requestId:"confirm-chapter-"+week,expectedRevision:await revision(),
    confirmReadyToRun:true});
   assert.equal(confirmed.status,"APPLIED");
  }
  const savedPpv=await saveCardEditorAsActor(context,{...scope,
   showId:"spring-riot",requestId:"book-ppv-payoff",expectedRevision:await revision(),
   matches:[{slotId:"ppv-main",payload:match("A")}],
   segments:[],runningOrder:["ppv-main"]});
  assert.equal(savedPpv.status,"APPLIED");
  // A fresh full-approval clause on the participant requires authentic
  // consent. No future booking or creative note may override this right.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET creative_control='FULL_APPROVAL'"+
   " WHERE world_id=$1 AND contract_id=$2",
   [worldId,contracts[1]!]));
  const beforeConsent=await revision();
  await assert.rejects(markPreparedShowReadyAsActor(context,{...scope,
   showId:"spring-riot",requestId:"unapproved-ppv",expectedRevision:beforeConsent,
   confirmReadyToRun:true}),/creative agreement/i);
  assert.equal(await revision(),beforeConsent,
   "A refused PPV confirmation must not mutate the World");
  // Test-only reversion of the changed contractual term. The player would
  // need a genuine consent receipt if the right remained in force.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET creative_control='NONE'"+
   " WHERE world_id=$1 AND contract_id=$2",
   [worldId,contracts[1]!]));
  const confirmedPpv=await markPreparedShowReadyAsActor(context,{...scope,
   showId:"spring-riot",requestId:"confirm-ppv",expectedRevision:await revision(),
   confirmReadyToRun:true});
  assert.equal(confirmedPpv.status,"APPLIED");
  // A title payoff is forbidden without a booked title match. The manager's
  // intended plot cannot quietly manufacture a championship transfer.
  await assert.rejects(chooseProgrammeFinale(db.pool,{...scope,programmeId,
   showId:"spring-riot",slotId:"ppv-main",payoff:"TITLE_SHOWDOWN",
   requestId:"invalid-title-payoff",expectedRevision:await revision()}),
   /doesn't support|payoff/i);
  const finale=await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   showId:"spring-riot",slotId:"ppv-main",payoff:"DECISIVE_MATCH",
   requestId:"book-finale",expectedRevision:await revision()});
  assert.equal(finale.status,"APPLIED");
  const pendingStory=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(pendingStory.status,"ACTIVE");
  assert.equal(pendingStory.activityCount,0,
   "Planned future chapters must not count as certified story history");
  assert.equal(pendingStory.finale?.resolvedWeekIndex,null);
  assert.ok(pendingStory.plannedActivity.some(a=>a.showId==="spring-riot"&&
   a.slotId==="ppv-main"&&a.kind==="MATCH"),
   "A real booked main event is linked to its Programme before World Lock");
  const snapshot=await readSixWeekPlanner(db.pool,scope);
  const build=buildSixWeekProduction(snapshot.weeks);
  assert.equal(build.submittedShows,3);
  assert.equal(snapshot.weeks.flatMap(w=>w.shows)
   .filter(show=>show.status==="SUBMITTED"||show.ready).length,7,
   "All seven shows have either been submitted or explicitly confirmed by owner");
  assert.equal(build.programmeCount,1);
  assert.equal(build.programmes[0]?.chapters.length,4);
  assert.equal(build.programmes[0]?.chapters[3]?.finalePayoff,"DECISIVE_MATCH",
   "Only an actually selected and linked PPV chapter is marked as a planned finale");
  assert.equal(build.nextPremium?.name,"Spring Riot");
  assert.equal(build.nextPremium?.week,6);
  assert.equal(snapshot.weeks[5]?.shows.length,2);
  assert.equal(snapshot.weeks[5]?.shows.every(s=>
   s.status==="SUBMITTED"||s.ready),true);
  assert.equal(snapshot.weeks[5]?.shows.find(s=>s.bookingClass==="PREMIUM")?.status,
   "DRAFT","An explicit owner-ready future PPV is still a draft until certified");
  assert.equal(snapshot.weeks[6]?.shows.length,0);
  assert.equal((await read<{n:string}>(`SELECT count(*)::text AS n
   FROM ppw_completed_shows WHERE world_id=$1`,[worldId]))[0]!.n,"0",
   "Advance cards and planned PPV are not completed events");
  const planned=await saveCreativeOutline(db.pool,{...scope,
   requestId:"six-week-outline",expectedRevision:snapshot.worldRevision,
   notes:[{year:1,week:2,note:"Challenge gains traction"},
    {year:1,week:6,note:"Spring Riot title payoff if legally eligible"}]});
  assert.equal(planned.status,"APPLIED");
  await assert.rejects(readSixWeekPlanner(db.pool,{...scope,playerId:"rival-manager"}),
   /denied|not accessible/i);

  // The sixth FUTURE week (Week 7) must be usable as a finale target too.
  // Test a real linked chapter and then deliberately cancel it before
  // leaving the player alone to run their already confirmed PPV programme.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,show_day,venue_id,market_id,booking_class,event_type,
    show_name,show_series_id,event_importance)
   VALUES($1,'tv-7',$2,1,7,'DRAFT',5,$3,'home','REGULAR','REGULAR',
    'CWA Weekly','flagship',70)`,[worldId,promotionId,venueId]));
  assert.equal((await saveCardEditorAsActor(context,{...scope,
   showId:"tv-7",requestId:"potential-week-seven",
   expectedRevision:await revision(),
   matches:[{slotId:"main",payload:match("A")}],
   segments:[],runningOrder:["main"]})).status,"APPLIED");
  const future=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.ok(future.plannedActivity.some(p=>p.showId==="tv-7"),
   "The Programme desk must include the sixth future week, not stop at five");
  assert.equal((await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   showId:"tv-7",slotId:"main",payoff:"DECISIVE_MATCH",
   requestId:"tentative-week-seven",expectedRevision:await revision()})).status,
   "APPLIED","A genuine Week 7 chapter is eligible in a Week 1 Planner");
  assert.equal((await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   showId:"spring-riot",slotId:"ppv-main",payoff:"DECISIVE_MATCH",
   requestId:"restore-spring-riot",expectedRevision:await revision()})).status,
   "APPLIED","The owner may move an unfinished finale back to the booked PPV");
  assert.equal((await saveCardEditorAsActor(context,{...scope,
   showId:"tv-7",requestId:"remove-tentative-chapter",
   expectedRevision:await revision(),matches:[],segments:[],
   runningOrder:[]})).status,"APPLIED");
  const restored=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(restored.finale?.showId,"spring-riot");
  assert.ok(!restored.plannedActivity.some(p=>p.showId==="tv-7"),
   "Removing a draft chapter must not leave an invented future feud beat");

  // Never call a booking save, Planner edit or manager response in this loop.
  // Manual advancement remains explicit, exercising canonical World Lock
  // on each of six distinct certified weeks, including the named premium.
  for(let week=1;week<=6;week++){
   let result:Awaited<ReturnType<typeof advancePlaytestWeek>>|null=null;
   for(let stage=0;stage<18;stage++){
    result=await advancePlaytestWeek(db.pool,worldId,1,week);
    if(result.status==="PUBLISHED"||result.status==="BLOCKED")break;
   }
   assert.equal(result?.status,"PUBLISHED",
    "Week "+week+" must certify the saved show without manager login: "+
     JSON.stringify(result));
   const current=await read<{year:number;week:number;phase:string}>(
    "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]);
   assert.deepEqual(current,[{year:1,week:week+1,phase:"OPEN"}]);
   const completed=await read<{show_id:string}>(`
    SELECT show_id FROM ppw_completed_shows WHERE world_id=$1
    AND show_id=$2`,[worldId,"tv-"+week]);
   assert.equal(completed.length,1,"Pre-authored television must be certified");
   if(week===1){
    // The medical table requires immutable show evidence. First certify
    // the actual Week 1 match, then model a real record of injury affecting
    // future booked TV and PPV chapters. No phantom injury may be inserted.
    await withWorldTransaction(db.pool,async tx=>{
     await tx.query("INSERT INTO ppw_medical_absences("+
      "world_id,person_id,show_id,match_id,injured_week_index,"+
      "cleared_week_index,weeks_out,severity,status)"+
      " VALUES($1,$2,'tv-1','main',0,9,9,'MODERATE','ACTIVE')",
      [worldId,people[0]!]);
     await tx.query("UPDATE ppw_people SET status='INJURED'"+
      " WHERE world_id=$1 AND person_id=$2",[worldId,people[0]!]);
    });
    const onHold=(await readProgrammeWorkspace(db.pool,scope)).programmes
     .find(p=>p.programmeId===programmeId)!;
    assert.deepEqual(onHold.medicalHolds,[{
     personId:people[0]!,name:"Wrestler 0",clearedWeekIndex:9
    }],"The booked PPV build must surface a verified medical absence");
    assert.equal(onHold.status,"ACTIVE","An injury must not fabricate a feud payoff");
    // This fixture explicitly clears the medical record before the next
    // controlled advance. Real gameplay cannot auto-waive the injury.
    await withWorldTransaction(db.pool,async tx=>{
     await tx.query("DELETE FROM ppw_medical_absences"+
      " WHERE world_id=$1 AND person_id=$2",[worldId,people[0]!]);
     await tx.query("UPDATE ppw_people SET status='ACTIVE'"+
      " WHERE world_id=$1 AND person_id=$2",[worldId,people[0]!]);
    });
   }
   if(week===3){
    const inProgress=await readSixWeekPlanner(db.pool,scope);
    assert.deepEqual(inProgress.creativeOutline,
     [{year:1,week:6,note:"Spring Riot title payoff if legally eligible"}]);
    const halfway=(await readProgrammeWorkspace(db.pool,scope)).programmes
     .find(p=>p.programmeId===programmeId)!;
    assert.equal(halfway.status,"ACTIVE","A future PPV does not close a rivalry early");
    assert.equal(halfway.matchCount,2);
    assert.equal(halfway.segmentCount,2);
    assert.equal(halfway.finale?.resolvedWeekIndex,null);
   }
  }
  const ppv=await read<{show_id:string}>(`SELECT show_id
   FROM ppw_completed_shows WHERE world_id=$1 AND show_id='spring-riot'`,
   [worldId]);
  assert.equal(ppv.length,1,"The scheduled PPV was certified, not just announced");
  const completedFeud=(await readProgrammeWorkspace(db.pool,scope)).programmes
   .find(p=>p.programmeId===programmeId)!;
  assert.equal(completedFeud.status,"COMPLETED",
   "Only the linked PPV match certification delivers the manager's feud finale");
  assert.equal(completedFeud.matchCount,4);
  assert.equal(completedFeud.segmentCount,3);
  assert.equal(completedFeud.finale?.resolvedWeekIndex,5);
  assert.equal(completedFeud.finale?.resolvedWinnerSide,"A");
  assert.equal((await read<{n:number}>(`
   SELECT count(*)::integer AS n FROM ppw_ledger_events
   WHERE world_id=$1 AND event_type='PROGRAMME_FINALE_DELIVERED'`,
   [worldId]))[0]!.n,1,"The PPV's on-screen finale is a single immutable event");
  assert.equal((await read<{n:string}>(`
   SELECT count(*)::text AS n FROM ppw_completed_shows WHERE world_id=$1
   AND promotion_id=$2`,[worldId,promotionId]))[0]!.n,"7");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_programme_finales","ppw_programme_postshow_directions",
    "ppw_programme_resolved_activities","ppw_medical_absences",
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_playtest_dark_weeks","ppw_ledger_events","ppw_command_receipts",
    "ppw_programme_match_activities","ppw_card_slots","ppw_booking_drafts",
    "ppw_show_series","ppw_programme_creative_agreements",
    "ppw_programme_talent_baselines","ppw_programme_side_refs",
    "ppw_programme_participants","ppw_programmes","ppw_contracts",
    "ppw_people","ppw_venues","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions","ppw_markets"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
