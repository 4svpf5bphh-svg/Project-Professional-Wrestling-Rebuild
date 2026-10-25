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
import {readWorldHeritage,readOlderWorldMoments,publishYearEndHallOfFame} from "../src/db/world-honours.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";

const url=process.env.PPW_NEON_TEST_URL;
test("complete World year settles earned honours, career Hall and moments once for all managers",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="honours-"+randomUUID(),owners=["h1-"+randomUUID(),"h2-"+randomUUID()];
 const db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  for(let i=0;i<2;i++){
   assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owners[i]!,
    requestId:"h-join-"+i,expectedRevision:i*2})).status,"APPLIED");
   assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owners[i]!,
    promotionId:"promotion-"+i,requestId:"h-claim-"+i,expectedRevision:i*2+1})).status,"APPLIED");
  }
  const wrestlers=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;name:string}>(`
   SELECT person_id,name FROM ppw_people WHERE world_id=$1
    AND booking_division='MEN' ORDER BY person_id LIMIT 2`,[world]));
  assert.equal(wrestlers.length,2);
  const [hero,rival]=wrestlers.map(p=>p.person_id);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
     status,show_name,show_day)
    SELECT $1,'heritage-'||n,'promotion-0',1,n,
     'SUBMITTED','Chapter '||n,(n%7)+1 FROM generate_series(1,24) n
    UNION ALL SELECT $1,'heritage-finale','promotion-0',1,52,
     'SUBMITTED','Final World Classic',2`,[world]);
   await tx.query(`
    INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    SELECT $1,draft_id,'match',1,'MATCH',jsonb_build_object(
     'matchType','SINGLES','participants',jsonb_build_array(
      jsonb_build_object('personId',$2::text,'contractId','a'),
      jsonb_build_object('personId',$3::text,'contractId','b')),
     'secretCreative','UNPUBLISHED CARD PLANS')
    FROM ppw_booking_drafts WHERE world_id=$1
     AND draft_id LIKE 'heritage-%'`,[world,hero,rival]);
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,
     resolution_id,crowd_response,receipt_json,receipt_digest)
    SELECT $1,'promotion-0',draft_id,1,week,draft_id||'-resolution',
     CASE WHEN week=52 THEN 96 ELSE 82 END,'{}'::jsonb,
     repeat(md5(draft_id),2)
    FROM ppw_booking_drafts WHERE world_id=$1
     AND draft_id LIKE 'heritage-%'`,[world]);
   await tx.query(`
    INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,
     position,crowd_response,actual_finish,actual_winner_side)
    SELECT $1,show_id,'match',1,95,'CLEAN_PIN','A'
    FROM ppw_completed_shows WHERE world_id=$1
     AND show_id LIKE 'heritage-%'`,[world]);
   await tx.query(`
    INSERT INTO ppw_completed_match_report_facts(world_id,show_id,match_id,
     rating_stars,execution_quality,chemistry_modifier,actual_minutes)
    SELECT $1,show_id,'match',CASE WHEN show_id='heritage-finale'
      THEN 4.90 ELSE 4.50 END,91,1,19
    FROM ppw_completed_shows WHERE world_id=$1
     AND show_id LIKE 'heritage-%'`,[world]);
   await tx.query(`
    INSERT INTO ppw_individual_field_career_effects(
     world_id,show_id,match_id,person_id,actual_winner_side,performer_side,
     won,before_stats,after_stats)
    SELECT $1,m.show_id,m.match_id,$2,'A','A',true,'{}'::jsonb,'{}'::jsonb
    FROM ppw_completed_show_matches m WHERE m.world_id=$1
     AND m.show_id LIKE 'heritage-%'
    UNION ALL
    SELECT $1,m.show_id,m.match_id,$3,'A','B',false,'{}'::jsonb,'{}'::jsonb
    FROM ppw_completed_show_matches m WHERE m.world_id=$1
     AND m.show_id LIKE 'heritage-%'`,[world,hero,rival]);
   await tx.query(`
    UPDATE ppw_people SET status='RETIRED'
    WHERE world_id=$1 AND person_id=$2`,[world,hero]);
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,1,52,'WRESTLER_RETIRED',
     jsonb_build_object('personId',$2))`,[world,hero]);
   await tx.query(`
    INSERT INTO ppw_world_news_weeks(world_id,year,week)
    SELECT $1,1,generate_series(1,51)`,[world]);
   await tx.query(`
    UPDATE ppw_worlds SET year=1,week=52,phase='RESOLVING'
    WHERE world_id=$1`,[world]);
   await tx.query(`
    INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions)
    VALUES($1,1,52,8)`,[world]);
  });
  const response=await withWorldTransaction(db.pool,tx=>
   publishCertifiedWorldNews(tx,world,1,52));
  assert.equal(response.published,true);
  assert.equal((await withWorldTransaction(db.pool,tx=>
   publishCertifiedWorldNews(tx,world,1,52))).published,false);
  // Match the production sequencing: career retirement is settled before
  // the year-end Hall decision, inside the same authoritative transaction.
  assert.equal(await withWorldTransaction(db.pool,tx=>
   publishYearEndHallOfFame(tx,world,1,52)),1);
  assert.equal(await withWorldTransaction(db.pool,tx=>
   publishYearEndHallOfFame(tx,world,1,52)),0,
   "A deserving retiree cannot be inducted twice");
  // Simulate a long-lived certified archive using only actually completed
  // shows; older pages must remain reachable without preloading them.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_world_moments(world_id,year,week,moment_key,kind,
    headline,description,promotion_name,show_id)
   SELECT $1,1,s.week,'event:'||s.show_id||':'||suffix.n,
    'EVENT','Historic edition '||s.week,'A completed public broadcast.',
    'Human Pro',s.show_id
   FROM ppw_completed_shows s CROSS JOIN (VALUES(1),(2)) AS suffix(n)
   WHERE s.world_id=$1 AND s.week<52`,[world]));
  const first=await readWorldHeritage(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owners[0]!});
  const second=await readWorldHeritage(db.pool,{
   worldId:world,promotionId:"promotion-1",playerId:owners[1]!});
  assert.deepEqual(first,second,"World history must be identical for rival managers");
  assert.ok(first.honours.some(x=>x.category==="MATCH"&&x.name.includes(" vs ")));
  assert.ok(first.honours.some(x=>x.category==="WRESTLER_MEN"&&x.subjectId===hero));
  assert.ok(first.honours.some(x=>x.category==="PROMOTION"&&x.subjectId==="promotion-0"));
  assert.equal(first.hall.length,1);
  assert.equal(first.hall[0]!.personId,hero);
  assert.equal(first.hall[0]!.matches,25);
  assert.ok(first.moments.some(m=>m.kind==="CLASSIC"&&m.week===52));
  assert.equal(first.moments.length,40);
  assert.ok(first.momentCursor);
  const older=await readOlderWorldMoments(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:owners[0]!},
   first.momentCursor!);
  assert.equal(older.moments.length,9,"Older certified Moments stay browseable");
  assert.equal(older.momentCursor,null);
  const olderViaRpc=await dispatchCardRpc({pool:db.pool,
   actor:{playerId:owners[1]!}},"worldMomentsOlder",{
    worldId:world,promotionId:"promotion-1",cursor:first.momentCursor,
    playerId:"unknown"});
  assert.deepEqual(olderViaRpc,older);
  await assert.rejects(readOlderWorldMoments(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:"unknown"},first.momentCursor!),
   /access denied/);
  assert.ok(!JSON.stringify(first).includes("UNPUBLISHED CARD PLANS"));
  await assert.rejects(readWorldHeritage(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:"unknown"}),/access denied/);
  const routed=await dispatchCardRpc({pool:db.pool,actor:{playerId:owners[0]!}},
   "worldHeritage",{worldId:world,promotionId:"promotion-0",playerId:"unknown"});
  assert.deepEqual(routed,first);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_world_hall_of_fame","ppw_world_year_honours",
    "ppw_world_moments","ppw_world_news_items","ppw_world_news_awards",
    "ppw_world_news_weeks","ppw_individual_field_career_effects",
    "ppw_completed_match_report_facts","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts",
    "ppw_week_resolution_seals","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[owners]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
