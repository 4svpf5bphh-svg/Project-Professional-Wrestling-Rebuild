import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleCertifiedWorldLegends} from "../src/db/legends-settlement.js";
import {findLegend} from "../src/domain/legends-catalogue.js";
import {readLegendPilot,armLegendPilot,cancelLegendPilot} from "../src/db/legend-reveal-pilot.js";
import {readLegendsVault,markLegendRevealSeen,hasUnseenLegendReveal} from "../src/db/legends-vault.js";
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
   // This settlement test focuses on market entry, cards and multiplayer
   // privacy. Seed already-certified lifetime counters from the SAME World
   // rather than constructing another 127 artificial card slots in one show.
   // Eight genuine matches above add to the newly calibrated World target.
   await tx.query(`INSERT INTO ppw_legend_metrics(world_id,metric,value)
    VALUES($1,'CLASSICS',$2)`,
    [world,findLegend("jerry-lynn")!.target!-8]);
  });
  const first=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,1));
  assert.equal(first.processed,true);
  assert.deepEqual(first.unlocked,["jerry-lynn"]);
  // Higher rarity requires far more evidence; one large week is not enough.
  const replay=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,1));
  assert.deepEqual(replay,{processed:false,unlocked:[]});
  assert.equal(await hasUnseenLegendReveal(db.pool,a),true,
   "A real World Legend unlock must trigger a future signed-in ceremony");
  assert.equal(await hasUnseenLegendReveal(db.pool,b),true,
   "Each human manager has an independent one-time reveal");
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
  assert.equal(arrivals.length,1);
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
  assert.equal(await hasUnseenLegendReveal(db.pool,a),false,
   "Returning to PPW cannot replay an already acknowledged ceremony");
  assert.equal(await hasUnseenLegendReveal(db.pool,b),true,
   "Another manager must not lose a reveal because the first saw it");
  const after=await readLegendsVault(db.pool,a);
  assert.equal(after.entries.find(x=>x.id==="jerry-lynn")?.revealSeen,true);
  assert.equal(after.entries.find(x=>x.id==="jerry-lynn")?.collectibleReady,true);
  assert.equal(after.entries.find(x=>x.id==="jerry-lynn")?.cardAsset,
   "/assets/legends/jerry-lynn-cult-card.webp");
  assert.equal((await readLegendsVault(db.pool,b)).entries.find(
   x=>x.id==="jerry-lynn")?.revealSeen,false);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_kp_wallets(player_id,balance,lifetime_earned)
   VALUES($1,10000,10000)`,[owner]));
  await applyKayfabeAction(db.pool,a,{
   kind:"COLLECT_LEGEND",legendId:"jerry-lynn",requestId:"collect"
  });
  const afterCollection=await readLegendsVault(db.pool,a);
  assert.equal(afterCollection.entries.find(x=>x.id==="jerry-lynn")?.collected,true);
  assert.equal(afterCollection.entries.find(x=>x.id==="jerry-lynn")?.revealSeen,true,
   "Old unlock/reveal records survive artwork activation");
  assert.equal((await readLegendsVault(db.pool,b)).entries.find(
   x=>x.id==="jerry-lynn")?.collected,false);
  const wallet=await withWorldTransaction(db.pool,tx=>tx.query<{balance:string}>(`
   SELECT balance::text FROM ppw_kp_wallets WHERE player_id=$1`,[owner]));
  assert.equal(Number(wallet[0]!.balance),9250);
  assert.equal(await withWorldTransaction(db.pool,tx=>tx.query(`
   SELECT legend_id FROM ppw_kp_legend_cards WHERE player_id=$1`,[owner])).then(x=>x.length),1);
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
  await assert.rejects(hasUnseenLegendReveal(db.pool,{...a,playerId:other}),
   /access denied/,"A session cannot query another manager's Legend status");
  // Later certified World weeks continue to honour the queued cumulative
  // achievement; nothing arrives just because a client opened the Vault.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET week=13 WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions)
    VALUES($1,1,13,3)`,[world]);
   await tx.query(`
    INSERT INTO ppw_world_news_weeks(world_id,year,week) VALUES($1,1,13)`,[world]);
   // A new, independently measured angle milestone earns a different
   // Legend without needing to create a second World or reset the save.
   await tx.query(`UPDATE ppw_legend_metrics SET value=$2
    WHERE world_id=$1 AND metric='HOT_ANGLES'`,
    [world,findLegend("raven")!.target!*2]);
  });
  const later=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,13));
  assert.deepEqual(later.unlocked,["raven"]);
  const laterRecord=await withWorldTransaction(db.pool,tx=>tx.query<{
   legend_id:string;year:number;week:number}>(`
   SELECT legend_id,year,week FROM ppw_world_legend_unlocks
   WHERE world_id=$1 ORDER BY year,week`,[world]));
  assert.deepEqual(laterRecord,[
   {legend_id:"jerry-lynn",year:1,week:1},
   {legend_id:"raven",year:1,week:13}
  ]);
 }finally{
  // Disposable Postgres fixture; never connect this test to Production.
  await db.close();
 }
});

test("the designated operator arms one Undertaker reveal; another promotion, off-week, or repeat cannot trigger it",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const uid=randomUUID(),world="legend-pilot-"+uid,
  operator="pilot-op-"+uid,other="pilot-other-"+uid,db=postgresPool(url!,3);
 const operatorScope={worldId:world,promotionId:"operator",playerId:operator};
 const otherScope={worldId:world,promotionId:"other",playerId:other};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Undertaker pilot fixture",seed:42,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"operator",name:"Operator Wrestling",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"other",name:"Second Wrestling",tier:"LOCAL"});
   await tx.query(`INSERT INTO ppw_players(player_id) VALUES($1),($2)`,[operator,other]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')`,[world,operator,other]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'operator'),($1,$3,'other')`,[world,operator,other]);
   await tx.query(`INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions)
    VALUES($1,1,1,2),($1,1,2,2)`,[world]);
   await tx.query(`INSERT INTO ppw_world_news_weeks(world_id,year,week)
    VALUES($1,1,1),($1,1,2)`,[world]);
   // Week 1 belongs to a different human promotion. It must not unlock the trial.
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,booking_class) VALUES($1,'other-week-one','other',1,1,'SUBMITTED','REGULAR')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
    receipt_json,receipt_digest)
    VALUES($1,'other','other-week-one',1,1,'pilot-other-resolution',70,'{}'::jsonb,repeat('a',64))`,[world]);
  });
  assert.equal(await readLegendPilot(db.pool,world),null);
  await assert.rejects(armLegendPilot(db.pool,world,"unauthorised"),/operator promotion/);
  assert.equal((await armLegendPilot(db.pool,world,operator)).status,"ARMED");
  await assert.rejects(armLegendPilot(db.pool,world,operator),/already armed/);
  assert.equal((await cancelLegendPilot(db.pool,world,operator)).status,"CANCELLED");
  assert.equal((await armLegendPilot(db.pool,world,operator)).status,"ARMED");
  const otherShow=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,1));
  assert.deepEqual(otherShow.unlocked,[]);
  assert.equal((await readLegendPilot(db.pool,world))?.status,"ARMED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`UPDATE ppw_worlds SET week=2 WHERE world_id=$1`,[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,booking_class) VALUES($1,'operator-week-two','operator',1,2,'SUBMITTED','REGULAR')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
    receipt_json,receipt_digest)
    VALUES($1,'operator','operator-week-two',1,2,'pilot-operator-resolution',80,
     '{}'::jsonb,repeat('b',64))`,[world]);
  });
  const unlocked=await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,2));
  assert.deepEqual(unlocked.unlocked,["undertaker"]);
  assert.equal((await readLegendPilot(db.pool,world))?.status,"CONSUMED");
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleCertifiedWorldLegends(tx,world,1,2)),{processed:false,unlocked:[]});
  await assert.rejects(armLegendPilot(db.pool,world,operator),/already entered/);
  const myVault=await readLegendsVault(db.pool,operatorScope);
  const theirVault=await readLegendsVault(db.pool,otherScope);
  const deadman=myVault.entries.find(e=>e.id==="undertaker");
  assert.equal(deadman?.unlocked,true);
  assert.equal(deadman?.revealSeen,false);
  assert.equal(deadman?.collectibleReady,true);
  assert.equal(deadman?.price,4000);
  assert.equal(theirVault.entries.find(e=>e.id==="undertaker")?.unlocked,true);
  const arrival=await withWorldTransaction(db.pool,tx=>tx.query<{
   metric:string;evidence_value:number;person_ids:string[]}>(`
   SELECT metric,evidence_value,person_ids FROM ppw_world_legend_unlocks
   WHERE world_id=$1 AND legend_id='undertaker'`,[world]));
  assert.equal(arrival[0]?.metric,"PILOT_WEEKLY_SHOW");
  assert.equal(arrival[0]?.evidence_value,1);
  const ids=arrival[0]!.person_ids;
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query(`
   SELECT contract_id FROM ppw_contracts
   WHERE world_id=$1 AND person_id=ANY($2::text[])`,[world,ids]))).length,0);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_kp_wallets(player_id,balance,lifetime_earned)
   VALUES($1,5000,5000)`,[operator]));
  await applyKayfabeAction(db.pool,operatorScope,{
   kind:"COLLECT_LEGEND",legendId:"undertaker",requestId:"pilot-card"});
  const collected=await readLegendsVault(db.pool,operatorScope);
  assert.equal(collected.entries.find(e=>e.id==="undertaker")?.collected,true);
  assert.equal((await readLegendsVault(db.pool,otherScope)).entries.find(
   e=>e.id==="undertaker")?.collected,false);
  const wallet=await withWorldTransaction(db.pool,tx=>tx.query<{balance:string}>(`
   SELECT balance::text FROM ppw_kp_wallets WHERE player_id=$1`,[operator]));
  assert.equal(Number(wallet[0]!.balance),1000);
 }finally{await db.close();}
});
