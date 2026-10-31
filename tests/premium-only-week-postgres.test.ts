import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {markPreparedShowReady} from "../src/db/ready-prepared-show.js";
import {advancePlaytestWeek} from "../src/db/manual-playtest-week.js";
import {premiumOnlyWeekSql} from "../src/db/premium-only-week.js";
const url=process.env.PPW_NEON_TEST_URL;

/** Regression for the actual Week 14 state: a one-in-two-week flagship is off,
 * but the owner's venue-backed, confirmed premium card must still publish.
 * Never fabricate a television show or mark a genuine PPV as a dark week.
 */
test("a ready premium-only week publishes through the same certified World Lock",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const uid=randomUUID(),world="premium-only-"+uid,player="owner-"+uid,
  home="home-"+uid,ai="ai-"+uid,venue="venue-"+uid,
  ppv="armageddon-"+uid,aiShow="ai-tv-"+uid,future="next-tv-"+uid;
 const people=[0,1,2,3].map(n=>"person-"+n+"-"+uid);
 const contracts=people.map((_,n)=>"contract-"+n+"-"+uid);
 const db=postgresPool(url!,4);
 const read=<T extends Record<string,unknown>>(sql:string,args:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,args));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Premium Only",seed:914,rulesetVersion:"test"});
   for(const id of [home,ai])await addPromotion(tx,world,{id,name:id,tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET week=2,injury_rate_multiplier=0 WHERE world_id=$1",[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",[world,player,home]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,$2,'Main Arena')",[world,venue]);
   // Index 0 was a flagship week; index 1 is an off-week with a named PPV.
   await tx.query(`INSERT INTO ppw_show_series(world_id,promotion_id,series_id,
    name,role,event_type,cadence_weeks,anchor_week,importance) VALUES
    ($1,$2,'flagship','Ascension','FLAGSHIP','REGULAR',2,0,70),
    ($1,$2,'armageddon','Armageddon','PREMIUM','MAJOR',52,1,90)`,[world,home]);
   for(let i=0;i<4;i++){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
     in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,
     popularity,recognition,momentum,default_alignment)
     VALUES($1,$2,$3,'MEN',80,80,75,85,95,5,5,65,65,70,'FACE')`,
     [world,people[i],"Wrestler "+i]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,
     promotion_id,family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',3,52)`,
     [world,contracts[i],people[i],i<2?home:ai]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,
     event_importance,booking_class,event_type,show_name,show_series_id)
    VALUES($1,$2,$3,1,2,'DRAFT',6,$4,90,'PREMIUM','MAJOR','Armageddon','armageddon')`,
    [world,ppv,home,venue]);
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,booking_class,event_importance,event_type)
    VALUES($1,$2,$3,1,2,'SUBMITTED',2,$4,'REGULAR',60,'REGULAR')`,
    [world,aiShow,ai,venue]);
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,booking_class)
    VALUES($1,$2,$3,1,3,'DRAFT',5,$4,'REGULAR')`,
    [world,future,home,venue]);
   for(const [show,id0,id1] of [[ppv,0,1],[aiShow,2,3]] as const)
    await tx.query(`INSERT INTO ppw_card_slots
     (world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,$3,0,'MATCH',$4::jsonb)`,[world,show,"match-"+show,
     JSON.stringify({matchType:"SINGLES",participants:[
      {personId:people[id0],contractId:contracts[id0]},
      {personId:people[id1],contractId:contracts[id1]}],
      scriptedWinner:people[id0],intent:"TECHNICAL",
      plannedLengthMinutes:15,plannedFinish:"CLEAN_PIN"})]);
  });
  const policy=async(year:number,week:number)=>(await read<{eligible:boolean}>(
   `SELECT (${premiumOnlyWeekSql("p")}) AS eligible FROM ppw_promotions p
    WHERE p.world_id=$1 AND p.promotion_id=$4`,[world,year,week,home]))[0]!.eligible;
  assert.equal(await policy(1,1),false,
   "The regular show is due in Week 1 and cannot be skipped with a PPV");
  assert.equal(await policy(1,2),true,"Week 2 is legitimately premium-only");
  const marked=await markPreparedShowReady(db.pool,{worldId:world,
   promotionId:home,showId:ppv,playerId:player,
   requestId:"confirm-ppv",expectedRevision:0,confirmReadyToRun:true});
  assert.equal(marked.status,"APPLIED");
  assert.deepEqual(await read<{ready:boolean}>(`SELECT
   (lock_ready_fingerprint IS NOT NULL) AS ready FROM ppw_booking_drafts
   WHERE world_id=$1 AND draft_id=$2`,[world,ppv]),[{ready:true}]);
  let result:Awaited<ReturnType<typeof advancePlaytestWeek>>|null=null;
  for(let i=0;i<10;i++){
   result=await advancePlaytestWeek(db.pool,world,1,2);
   if(result.status==="PUBLISHED"||result.status==="BLOCKED")break;
  }
  assert.equal(result?.status,"PUBLISHED",
   "A confirmed premium show and independent AI regular show must resolve");
  assert.deepEqual(await read<{year:number;week:number;phase:string}>(
   "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[world]),
   [{year:1,week:3,phase:"OPEN"}]);
  assert.deepEqual(await read<{promotion_id:string;show_id:string}>(
   "SELECT promotion_id,show_id FROM ppw_completed_shows WHERE world_id=$1 ORDER BY promotion_id",
   [world]),[{promotion_id:ai,show_id:aiShow},{promotion_id:home,show_id:ppv}]
   .sort((a,b)=>a.promotion_id.localeCompare(b.promotion_id)));
  assert.equal((await read<{n:string}>(`SELECT count(*)::text AS n
   FROM ppw_playtest_dark_weeks WHERE world_id=$1`,[world]))[0]!.n,"0",
   "Do not transform the owner's real PPV into an off-week");
  assert.deepEqual(await read<{week:number;status:string}>(`SELECT week,status
   FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=$2`,[world,future]),
   [{week:3,status:"DRAFT"}]);
  await assert.rejects(advancePlaytestWeek(db.pool,world,1,2),/already progressed/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_medical_absences","ppw_completed_match_evidence",
    "ppw_completed_show_segments","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_show_resolutions","ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_playtest_dark_weeks","ppw_ledger_events","ppw_command_receipts",
    "ppw_card_slots","ppw_booking_drafts","ppw_show_series","ppw_contracts",
    "ppw_people","ppw_venues","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
