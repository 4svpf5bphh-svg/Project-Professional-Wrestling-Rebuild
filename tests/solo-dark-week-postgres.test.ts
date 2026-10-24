import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {advancePlaytestWeek} from "../src/db/manual-playtest-week.js";
const url=process.env.PPW_NEON_TEST_URL;
/** The live player has NO Week 4 show and an intact Week 5 card. A solo
 * Advance Week must be able to close the real off-week while AI runs and
 * original payroll, medical, market and one certification still settle. */
test("solo dark week advances with AI results, without fabricating the owner's show or losing future cards",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const nonce=randomUUID(),worldId="solo-dark-"+nonce;
 const human="solo-owner-"+nonce,host="solo-promotion-"+nonce,ai="ai-promotion-"+nonce;
 const show="ai-card-"+nonce,future="planned-next-"+nonce;
 const artists=["artist-a-"+nonce,"artist-b-"+nonce];
 const contracts=["contract-a-"+nonce,"contract-b-"+nonce];
 const db=postgresPool(url!,4);
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Solo Dark Week Test",seed:212,rulesetVersion:"test"});
   for(const id of [host,ai]){
    await addPromotion(tx,worldId,{id,name:id,tier:"LOCAL"});
    await tx.query("UPDATE ppw_promotions SET media_reach=70 WHERE world_id=$1 AND promotion_id=$2",
     [worldId,id]);
   }
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[human]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,human]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",
    [worldId,human,host]);
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[worldId]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'ai-venue','AI Hall')",[worldId]);
   for(let i=0;i<2;i++){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
      in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,
      popularity,recognition,momentum,default_alignment)
      VALUES($1,$2,$3,'MEN',80,80,75,85,95,5,5,65,65,70,'FACE')`,
     [worldId,artists[i],"Artist "+i]);
    await tx.query(`INSERT INTO ppw_contracts
      (world_id,contract_id,person_id,promotion_id,family,status,
       remaining_dates,expires_week_index)
      VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',3,52)`,
     [worldId,contracts[i],artists[i],ai]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,event_importance)
    VALUES($1,$2,$3,1,1,'SUBMITTED',2,'ai-venue',60)`,[worldId,show,ai]);
   await tx.query(`INSERT INTO ppw_card_slots
     (world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,'ai-main',0,'MATCH',$3::jsonb)`,
    [worldId,show,JSON.stringify({matchType:"SINGLES",participants:[
     {personId:artists[0],contractId:contracts[0]},
     {personId:artists[1],contractId:contracts[1]}],
     scriptedWinner:artists[1],intent:"TECHNICAL",
     plannedLengthMinutes:15,plannedFinish:"SUBMISSION"})]);
   // No Week 1 show for the human, but a real saved future card must survive.
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
    VALUES($1,$2,$3,1,2,'DRAFT',5,'ai-venue')`,[worldId,future,host]);
  });
  let result:Awaited<ReturnType<typeof advancePlaytestWeek>>|null=null;
  for(let i=0;i<8;i++){
   result=await advancePlaytestWeek(db.pool,worldId,1,1);
   if(result.status==="PUBLISHED"||result.status==="BLOCKED")break;
  }
  assert.equal(result?.status,"PUBLISHED",
   "All official AI and original World stages must complete with one operator's request");
  assert.deepEqual(await read<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]),
   [{year:1,week:2,phase:"OPEN"}]);
  assert.deepEqual(await read<{promotion_id:string}>(
   "SELECT promotion_id FROM ppw_playtest_dark_weeks WHERE world_id=$1",[worldId]),
   [{promotion_id:host}]);
  assert.deepEqual(await read<{promotion_id:string}>(
   "SELECT promotion_id FROM ppw_completed_shows WHERE world_id=$1",[worldId]),
   [{promotion_id:ai}],"The owner never receives a fictitious card or match result");
  assert.deepEqual(await read<{certified_promotions:number}>(
   "SELECT certified_promotions FROM ppw_week_resolution_seals WHERE world_id=$1",[worldId]),
   [{certified_promotions:1}]);
  const preserved=await read<{draft_id:string;week:number;status:string}>(
   "SELECT draft_id,week,status FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=$2",
   [worldId,future]);
  assert.deepEqual(preserved,[{draft_id:future,week:2,status:"DRAFT"}]);
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_ledger_events WHERE world_id=$1 AND event_type='SOLO_PLAYTEST_DARK_WEEK'",
   [worldId]))[0]!.n,"1");
  assert.ok((await read<{seconds:number}>(
   "SELECT extract(epoch from next_lock_at-clock_timestamp())::integer AS seconds FROM ppw_worlds WHERE world_id=$1",
   [worldId]))[0]!.seconds>4*365*24*3600,
   "Manual playtest weeks keep the distant booking cutoff");
  await assert.rejects(advancePlaytestWeek(db.pool,worldId,1,1),/already progressed/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_playtest_dark_weeks","ppw_ledger_events","ppw_command_receipts",
    "ppw_card_slots","ppw_booking_drafts","ppw_contracts","ppw_people",
    "ppw_venues","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[human]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
test("multiple active human controllers cannot silently skip each other's show",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const nonce=randomUUID(),worldId="multi-dark-"+nonce;
 const people=["owner-"+nonce,"other-"+nonce],promos=["p-"+nonce,"q-"+nonce];
 const db=postgresPool(url!,2);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"No implied two-player skipping",seed:213,rulesetVersion:"test"});
   for(const id of promos)await addPromotion(tx,worldId,{id,name:id,tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",people);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,people[0],people[1]]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true),($1,$4,$5,true)",
    [worldId,people[0],promos[0],people[1],promos[1]]);
  });
  await assert.rejects(advancePlaytestWeek(db.pool,worldId,1,1),/unfinished current-week show/);
  const state=await withWorldTransaction(db.pool,tx=>tx.query<{phase:string}>(
   "SELECT phase FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.deepEqual(state,[{phase:"OPEN"}]);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>tx.query(
   "SELECT promotion_id FROM ppw_playtest_dark_weeks WHERE world_id=$1",[worldId])),[]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_playtest_dark_weeks","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[people]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
