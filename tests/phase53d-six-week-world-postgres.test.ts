import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {advancePlaytestWeek} from "../src/db/manual-playtest-week.js";
import {readSixWeekPlanner,saveCreativeOutline} from "../src/db/planner-workspace.js";
import {buildSixWeekProduction} from "../src/domain/six-week-production-board.js";

const url=process.env.PPW_NEON_TEST_URL;

/** A real pre-authored six-week TV build ending in a Week 6 PPV.
 * Owner prepares all seven cards BEFORE World week one is resolved, does
 * not log in or change any card between locks, and sees certified outcomes.
 * This is a disposable PostgreSQL World, not production or automatic cron.
 */
test("pre-submitted six-week TV to PPV build certifies without daily manager visits",{
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
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,'CWA Arena')",
    [worldId,venueId]);
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
     promotion_id,year,week,status,show_day,venue_id,booking_class,event_type,
     show_name,show_series_id,event_importance)
     VALUES($1,$2,$3,1,$4,'SUBMITTED',5,$5,'REGULAR','REGULAR',
     'CWA Weekly','flagship',70)`,[worldId,showId,promotionId,week,venueId]);
    await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,
     position,kind,payload) VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,
     [worldId,showId,JSON.stringify({matchType:"SINGLES",
      participants:[{personId:people[0],contractId:contracts[0]},
       {personId:people[1],contractId:contracts[1]}],
      scriptedWinner:people[week%2],intent:"TECHNICAL",
      plannedLengthMinutes:15,plannedFinish:"CLEAN_PIN"})]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
    year,week,status,show_day,venue_id,booking_class,event_type,show_name,
    show_series_id,event_importance)
    VALUES($1,'spring-riot',$2,1,6,'SUBMITTED',7,$3,'PREMIUM','MAJOR',
     'Spring Riot','ppv',90)`,[worldId,promotionId,venueId]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,
    position,kind,payload) VALUES($1,'spring-riot','ppv-main',0,'MATCH',$2::jsonb)`,
    [worldId,JSON.stringify({matchType:"SINGLES",
     participants:[{personId:people[2],contractId:contracts[2]},
      {personId:people[3],contractId:contracts[3]}],
     scriptedWinner:people[2],intent:"COMPETITIVE",
     plannedLengthMinutes:20,plannedFinish:"CLEAN_PIN"})]);
  });

  const scope={worldId,promotionId,playerId};
  const snapshot=await readSixWeekPlanner(db.pool,scope);
  const build=buildSixWeekProduction(snapshot.weeks);
  assert.equal(build.submittedShows,7);
  assert.equal(build.nextPremium?.name,"Spring Riot");
  assert.equal(build.nextPremium?.week,6);
  assert.equal(snapshot.weeks[5]?.shows.length,2);
  assert.equal(snapshot.weeks[5]?.shows.every(s=>s.status==="SUBMITTED"),true);
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
   if(week===3){
    const inProgress=await readSixWeekPlanner(db.pool,scope);
    assert.deepEqual(inProgress.creativeOutline,
     [{year:1,week:6,note:"Spring Riot title payoff if legally eligible"}]);
   }
  }
  const ppv=await read<{show_id:string}>(`SELECT show_id
   FROM ppw_completed_shows WHERE world_id=$1 AND show_id='spring-riot'`,
   [worldId]);
  assert.equal(ppv.length,1,"The scheduled PPV was certified, not just announced");
  assert.equal((await read<{n:string}>(`
   SELECT count(*)::text AS n FROM ppw_completed_shows WHERE world_id=$1
   AND promotion_id=$2`,[worldId,promotionId]))[0]!.n,"7");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_programme_resolved_activities","ppw_medical_absences",
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_playtest_dark_weeks","ppw_ledger_events","ppw_command_receipts",
    "ppw_card_slots","ppw_booking_drafts","ppw_show_series","ppw_contracts",
    "ppw_people","ppw_venues","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
