import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {publishCertifiedWorldNews} from "../src/db/world-news.js";
import {readIndustryWorldNews} from "../src/db/industry-news.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("certified human and AI shows publish public awards, kept replay-safe and inaccessible to outsiders",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="news-"+randomUUID(),owner="owner-"+randomUUID(),
  db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"news-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:"promotion-0",requestId:"news-claim",expectedRevision:1})).status,"APPLIED");
  const roster=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;name:string}>(`
   SELECT person_id,name FROM ppw_people WHERE world_id=$1
   ORDER BY person_id LIMIT 4`,[world]));
  assert.equal(roster.length,4);
  const [a,b,c,d]=roster.map(p=>p.person_id);
  const payload=(one:string,two:string)=>JSON.stringify({
   matchType:"SINGLES",scriptedWinner:one,
   participants:[{personId:one,contractId:"c1"},
    {personId:two,contractId:"c2"}],
   secretBookingNote:"PRIVATE FUTURE PLANS"
  });
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
     status,show_name,event_type,show_day)
    VALUES($1,'hshow','promotion-0',1,1,'SUBMITTED','Human Fight Night','REGULAR',2),
     ($1,'aishow','promotion-1',1,1,'SUBMITTED','AI Crown Night','MAJOR',4),
     ($1,'future','promotion-1',1,2,'DRAFT','PRIVATE FUTURE PLANS','MAJOR',4)`,[world]);
   for(const [show,match,one,two] of [
    ["hshow","hmatch",a!,b!],["aishow","aimatch",c!,d!]
   ]){
    await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,$3,1,'MATCH',$4::jsonb)`,
     [world,show,match,payload(one,two)]);
   }
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,'aishow','angle',2,'SEGMENT',$2::jsonb)`,
    [world,JSON.stringify({kind:"TURN",actorIds:[c],targetIds:[d],
     hiddenCreativeDisagreement:"DO NOT PUBLISH THIS"})]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,
    crowd_response,receipt_json,receipt_digest)
    VALUES($1,'promotion-0','hshow',1,1,'h-res',42,'{}',repeat('a',64)),
     ($1,'promotion-1','aishow',1,1,'ai-res',91,'{}',repeat('b',64))`,[world]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(
    world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,'hshow','hmatch',1,83,'CLEAN_PIN','A'),
     ($1,'aishow','aimatch',1,96,'CLEAN_PIN','A')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_match_report_facts(
    world_id,show_id,match_id,rating_stars,execution_quality,
    chemistry_modifier,actual_minutes)
    VALUES($1,'hshow','hmatch',4.00,80,0,15),
     ($1,'aishow','aimatch',4.75,93,1,18)`,[world]);
   await tx.query(`INSERT INTO ppw_completed_show_segments(
    world_id,show_id,slot_id,position,kind,authored_outcome,
    crowd_response,story_json)
    VALUES($1,'aishow','angle',2,'TURN','HAPPENS',92,$2::jsonb)`,
    [world,JSON.stringify({kind:"TURN",outcome:"HAPPENS",position:2,
     headline:"A change of allegiance",actorIds:[c],targetIds:[d],
     privateRumour:"HIDDEN CONTRACT TALKS"})]);
   await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1`,[world]);
  });
  await assert.rejects(withWorldTransaction(db.pool,tx=>
   publishCertifiedWorldNews(tx,world,1,1)),/certification/);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_week_resolution_seals(
    world_id,year,week,certified_promotions) VALUES($1,1,1,8)`,[world]);
  });
  const first=await withWorldTransaction(db.pool,tx=>publishCertifiedWorldNews(tx,world,1,1));
  assert.equal(first.published,true);
  assert.equal(first.awards,2);
  const replay=await withWorldTransaction(db.pool,tx=>publishCertifiedWorldNews(tx,world,1,1));
  assert.equal(replay.published,false);
  const result=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owner});
  assert.equal(result.awards[0]!.kind,"MATCH");
  assert.deepEqual(result.annualAwards,[],"Year-end honours need a complete 52-week ledger");
  assert.equal(result.awards[0]!.promotionName,"Promotion 1");
  assert.equal(result.awards[0]!.rating,4.75);
  assert.ok(result.awards.some(x=>x.kind==="ANGLE"&&x.rating===92));
  assert.ok(result.stories.some(x=>x.desk==="DIRT"&&x.certainty==="SPECULATION"));
  const publicText=JSON.stringify(result);
  assert.ok(!publicText.includes("PRIVATE FUTURE PLANS"));
  assert.ok(!publicText.includes("HIDDEN CONTRACT TALKS"));
  assert.ok(!publicText.includes("DO NOT PUBLISH"));
  const viaRpc=await dispatchCardRpc({pool:db.pool,actor:{playerId:owner}},
   "industryNews",{worldId:world,promotionId:"promotion-0",playerId:"outsider"});
  assert.ok(JSON.stringify(viaRpc).includes("AI Crown Night"));
  await assert.rejects(readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:"outsider"}),/access denied/);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_world_news_weeks(world_id,year,week)
    SELECT $1,1,generate_series(2,52)`,[world]);
   await tx.query(`UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1`,[world]);
  });
  const annual=await readIndustryWorldNews(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owner});
  assert.equal(annual.annualAwards.length,2);
  assert.equal(annual.annualAwards.find(a=>a.kind==="MATCH")?.rating,4.75);
  assert.equal(annual.annualAwards.find(a=>a.kind==="ANGLE")?.rating,92);
  assert.equal(annual.awards.length,0,"Older weekly awards leave the 13-week feed");

 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_world_news_items","ppw_world_news_awards",
    "ppw_world_news_weeks","ppw_completed_match_report_facts",
    "ppw_completed_show_segments","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts",
    "ppw_week_resolution_seals","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
     await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
