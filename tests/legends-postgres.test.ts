import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleCertifiedWorldLegends} from "../src/db/legends-settlement.js";
import {readLegendsVault,markLegendRevealSeen} from "../src/db/legends-vault.js";
import {applyKayfabeAction} from "../src/db/kayfabe-points.js";
import {readWrestlerDirectory} from "../src/db/wrestler-directory.js";
import {recruitDistressedAiRosters} from "../src/db/living-world-promotions.js";

const url=process.env.PPW_NEON_TEST_URL;
test("certified classics introduce Legends as competing free agents once; account reveals and collectible cards stay independent",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="legends-"+id,
  owner="legends-a-"+id,other="legends-b-"+id,db=postgresPool(url!,3);
 const a={worldId:world,promotionId:"human-a",playerId:owner};
 const b={worldId:world,promotionId:"human-b",playerId:other};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Legends fixture",seed:7,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"human-a",name:"Alpha Wrestling",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"human-b",name:"Bravo Wrestling",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"ai",name:"Rescue Wrestling",tier:"LOCAL"});
   await tx.query(`INSERT INTO ppw_players(player_id) VALUES($1),($2)`,[owner,other]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')`,[world,owner,other]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'human-a'),($1,$3,'human-b')`,[world,owner,other]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,
    career_stage,booking_division,recognition,popularity,in_ring_quality,
    match_craft,presentation,stamina,fatigue,morale,contract_priorities)
    VALUES($1,'alice','Alice','ACTIVE','PRIME','WOMEN',55,55,90,90,85,85,0,70,
     '{"money":40,"role":80,"prestige":60,"schedule":40,"loyalty":40,"exposure":75}'::jsonb),
    ($1,'bob','Bob','ACTIVE','PRIME','MEN',55,55,90,90,85,85,0,70,
     '{"money":40,"role":80,"prestige":60,"schedule":40,"loyalty":40,"exposure":75}'::jsonb)`,[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,booking_class) VALUES($1,'legends-show','human-a',1,1,'SUBMITTED','REGULAR')`,
    [world]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    SELECT $1,'legends-show','classic-'||i,i,'MATCH',
     jsonb_build_object('matchType','SINGLES','scriptedWinner','alice',
      'participants',jsonb_build_array(
       jsonb_build_object('personId','alice','contractId','aa'),
       jsonb_build_object('personId','bob','contractId','bb')))
    FROM generate_series(1,8) i`,[world]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,'human-a','legends-show',1,1,'legend-resolution',91,'{}'::jsonb,repeat('a',64))`,
    [world]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,
    position,crowd_response,actual_finish,actual_winner_side)
    SELECT $1,'legends-show','classic-'||i,i,92,'CLEAN_PIN','A'
    FROM generate_series(1,8) i`,[world]);
   await tx.query(`INSERT INTO ppw_completed_match_report_facts(world_id,show_id,match_id,
    rating_stars,execution_quality,chemistry_modifier,actual_minutes)
    SELECT $1,'legends-show',match_id,4.80,95,0,20
    FROM ppw_completed_show_matches WHERE world_id=$1`,[world]);
   await tx.query(`INSERT INTO ppw_completed_match_evidence(world_id,show_id,match_id,evidence_json)
    SELECT $1,'legends-show',match_id,'{"booking":{"family":"INDIVIDUAL"}}'::jsonb
    FROM ppw_completed_show_matches WHERE world_id=$1`,[world]);
   await tx.query(`INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions)
    VALUES($1,1,1,3)`,[world]);
   await tx.query(`INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,1)`,
    [world]);
  });
  const first=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,1));
  assert.equal(first.processed,true);
  assert.deepEqual(first.unlocked.sort(),["jerry-lynn","mr-perfect"]);
  const replay=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,1));
  assert.deepEqual(replay,{processed:false,unlocked:[]});
  const readA=await readLegendsVault(db.pool,a);
  const readB=await readLegendsVault(db.pool,b);
  assert.deepEqual(readA.entries.map(x=>[x.id,x.unlocked]),
   readB.entries.map(x=>[x.id,x.unlocked]));
  assert.equal(readA.entries.find(x=>x.id==="jerry-lynn")?.progress,100);
  assert.equal(readA.entries.find(x=>x.id==="bruno-sammartino")?.name,null);
  const arrivals=await withWorldTransaction(db.pool,tx=>tx.query<{
   legend_id:string;person_ids:string[];ai_eligible_from_week_index:number}>(`
   SELECT legend_id,person_ids,ai_eligible_from_week_index
   FROM ppw_world_legend_unlocks WHERE world_id=$1 ORDER BY legend_id`,[world]));
  assert.equal(arrivals.length,2);
  assert.ok(arrivals.every(x=>x.ai_eligible_from_week_index===1));
  const personIds=arrivals.flatMap(x=>x.person_ids);
  const contracts=await withWorldTransaction(db.pool,tx=>tx.query<{contract_id:string}>(`
   SELECT contract_id FROM ppw_contracts WHERE world_id=$1 AND person_id=ANY($2::text[])
  `,[world,personIds]));
  assert.equal(contracts.length,0,"World unlocks cannot grant any promotion a contract");
  const marketplace=await readWrestlerDirectory(db.pool,b,{
   view:"MARKET",availability:"FREE_AGENT",division:"MEN",search:"Jerry Lynn"});
  assert.ok(marketplace.people.some(p=>p.name==="Jerry Lynn"));
  await markLegendRevealSeen(db.pool,a,"jerry-lynn");
  await markLegendRevealSeen(db.pool,a,"jerry-lynn");
  const after=await readLegendsVault(db.pool,a);
  assert.equal(after.entries.find(x=>x.id==="jerry-lynn")?.revealSeen,true);
  assert.equal((await readLegendsVault(db.pool,b)).entries.find(
   x=>x.id==="jerry-lynn")?.revealSeen,false);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_kp_wallets(player_id,balance,lifetime_earned)
   VALUES($1,10000,10000)`,[owner]));
  await assert.rejects(applyKayfabeAction(db.pool,a,{
   kind:"COLLECT_LEGEND",legendId:"jerry-lynn",requestId:"collect"}
  ),/artwork must be cleared/);
  const wallet=await withWorldTransaction(db.pool,tx=>tx.query<{balance:string}>(`
   SELECT balance::text FROM ppw_kp_wallets WHERE player_id=$1`,[owner]));
  assert.equal(Number(wallet[0]!.balance),10000);
  assert.equal(await withWorldTransaction(db.pool,tx=>tx.query(`
   SELECT legend_id FROM ppw_kp_legend_cards WHERE player_id=$1`,[owner])).then(x=>x.length),0);
  // Even emergency AI roster rebuilding may not circumvent the human opportunity window.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_promotions SET management_mode='AI',financial_distress='CRISIS'
   WHERE world_id=$1 AND promotion_id='ai'`,[world]));
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_world_legend_unlocks SET ai_eligible_from_week_index=100
   WHERE world_id=$1`,[world]));
  await withWorldTransaction(db.pool,tx=>recruitDistressedAiRosters(tx,world,1,5));
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query(`
   SELECT contract_id FROM ppw_contracts
   WHERE world_id=$1 AND person_id=ANY($2::text[])`,[world,personIds]))).length,0);
  await assert.rejects(readLegendsVault(db.pool,{...a,playerId:other}),/access denied/);
 }finally{
  // Disposable Postgres fixture; never connect this test to Production.
  await db.close();
 }
});
