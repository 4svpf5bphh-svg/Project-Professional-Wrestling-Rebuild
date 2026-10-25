
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleWorldHeritage} from "../src/db/world-heritage.js";
import {readChampionshipDirectory} from "../src/db/championship-history.js";
import {readPromotionCalendar} from "../src/db/calendar-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;

test("certified title headliners and real PPV editions earn prestige once; skipped editions and abandoned titles do not",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),world="heritage-"+suffix;
 const controller="owner-"+suffix,rival="rival-"+suffix;
 const db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Heritage Test",seed:18,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"promotion-a",name:"Arena A",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"promotion-b",name:"Arena B",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[controller,rival]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[world,controller,rival]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'promotion-a'),($1,$3,'promotion-b')",[world,controller,rival]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,'one','One'),($1,'two','Two')",[world]);
   await tx.query([
    "INSERT INTO ppw_championships(world_id,promotion_id,championship_id,",
    "name,division,status,prestige,last_contest_week_index)",
    "VALUES($1,'promotion-a','main','World Championship','SINGLES','ACTIVE',65,0),",
    "($1,'promotion-b','rival','Rival Championship','SINGLES','ACTIVE',65,0)"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_show_series(world_id,promotion_id,series_id,name,role,",
    "event_type,cadence_weeks,anchor_week,importance)",
    "VALUES($1,'promotion-a','annual','Founders Night','PREMIUM','MAJOR',52,9,99),",
    "($1,'promotion-b','annual','Rival Night','PREMIUM','MAJOR',52,9,99)"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,",
    "booking_class,show_series_id) VALUES($1,'ppv','promotion-a',1,10,'SUBMITTED',",
    "'PREMIUM','annual')"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,",
    "resolution_id,crowd_response,receipt_json,receipt_digest)",
    "VALUES($1,'promotion-a','ppv',1,10,'resolution',89,'{}'::jsonb,repeat('a',64))"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,",
    "crowd_response,actual_finish,actual_winner_side)",
    "VALUES($1,'ppv','title-match',0,89,'CLEAN_PIN','A')"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_completed_match_report_facts(world_id,show_id,match_id,",
    "rating_stars,execution_quality,chemistry_modifier,actual_minutes)",
    "VALUES($1,'ppv','title-match',4.5,89,0,18)"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_championship_contests(world_id,promotion_id,championship_id,",
    "show_id,slot_id,prior_reign_id,winner_person_id,title_changed)",
    "VALUES($1,'promotion-a','main','ppv','title-match',NULL,'one',TRUE)"
   ].join(" "),[world]);
   assert.deepEqual(await settleWorldHeritage(tx,world,1,10),{applied:true});
   assert.deepEqual(await settleWorldHeritage(tx,world,1,10),{applied:false});
  });
  const title=await readChampionshipDirectory(db.pool,world,controller,"promotion-a");
  const ours=title.titles.find(x=>x.championshipId==="main")!;
  assert.equal(ours.prestige,66.75);
  assert.equal(ours.titleRole,"PRIMARY");
  assert.equal(title.titles.find(x=>x.championshipId==="rival")?.prestige,64.82);
  const cal=await readPromotionCalendar(db.pool,{worldId:world,promotionId:"promotion-a",playerId:controller});
  const a=cal.series.find(s=>s.seriesId==="annual")!;
  assert.equal(a.earnedPrestige,2.4);
  assert.equal(a.celebratedEditions,1);
  assert.equal(a.lastCelebratedWeekIndex,9);
  const enemy=await readPromotionCalendar(db.pool,{worldId:world,promotionId:"promotion-b",playerId:rival});
  assert.equal(enemy.series.find(s=>s.seriesId==="annual")!.earnedPrestige,0);
  // No run of the published week may gain or decay prestige again.
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>settleWorldHeritage(tx,world,1,10)),{applied:false});
  await withWorldTransaction(db.pool,async tx=>{
   assert.deepEqual(await settleWorldHeritage(tx,world,1,11),{applied:true});
   assert.deepEqual(await settleWorldHeritage(tx,world,1,11),{applied:false});
  });
  const after=await readPromotionCalendar(db.pool,{worldId:world,promotionId:"promotion-a",playerId:controller});
  assert.equal(after.series.find(s=>s.seriesId==="annual")?.celebratedEditions,1);
  assert.equal(after.series.find(s=>s.seriesId==="annual")?.earnedPrestige,2.4);
  await assert.rejects(readChampionshipDirectory(db.pool,world,rival,"promotion-a"),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_heritage_week_settlements","ppw_championship_contests",
    "ppw_completed_match_report_facts","ppw_completed_show_matches","ppw_completed_shows",
    "ppw_booking_drafts","ppw_show_series","ppw_championship_reigns",
    "ppw_championships","ppw_ledger_events","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[controller,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
