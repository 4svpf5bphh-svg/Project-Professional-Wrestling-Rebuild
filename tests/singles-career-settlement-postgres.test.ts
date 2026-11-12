import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewArchivedShowMatchScores} from "../src/db/legacy-match-scoring.js";
import {settleCanonicalSinglesCareerConsequences}
 from "../src/db/singles-career-settlement.js";
import {applyVerifiedMedicalLoadInTransaction}
 from "../src/db/medical-availability.js";

const url=process.env.PPW_NEON_TEST_URL;
test("certified singles wins and protected losses persist once, rollback cleanly and do not double-charge injury load",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3);
 const unique=randomUUID(),worldId="singles-momentum-"+unique;
 const promotionId="single-promotion-"+unique,showId="single-show-"+unique;
 const winner="winner-"+unique,loser="loser-"+unique;
 const people=[winner,loser];
 const inspect=()=>withWorldTransaction(db.pool,tx=>tx.query<{
  person_id:string;fatigue:number;wear:number;momentum:number;
  popularity:number;recognition:number;status:string}>(`
  SELECT person_id,fatigue,wear,momentum,popularity,recognition,status
  FROM ppw_people WHERE world_id=$1 ORDER BY person_id`,[worldId]));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Singles Momentum Regression",seed:1124,
    rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Test Wrestling",tier:"INDEPENDENT"});
   await tx.query(`UPDATE ppw_worlds SET injury_rate_multiplier=1,phase='RESOLVING'
    WHERE world_id=$1`,[worldId]);
   await tx.query(`UPDATE ppw_promotions SET media_reach=55
    WHERE world_id=$1 AND promotion_id=$2`,[worldId,promotionId]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'test-venue','Arena')",[worldId]);
   for(const [i,personId] of people.entries()){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division,
     in_ring_quality,match_craft,presentation,stamina,safety,
     fatigue,wear,popularity,recognition,momentum)
     VALUES($1,$2,'Singles Star','MEN',84,78,77,80,88,14,9,50,58,48)`,
     [worldId,personId]);
    await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,
     promotion_id,family,status,remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,52)`,
     [worldId,"contract-"+i+"-"+unique,personId,promotionId]);
   }
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,
    promotion_id,year,week,status,show_day,venue_id,event_importance)
    VALUES($1,$2,$3,1,1,'SUBMITTED',5,'test-venue',75)`,
    [worldId,showId,promotionId]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,
    position,kind,payload) VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,
    [worldId,showId,JSON.stringify({matchType:"SINGLES",participants:people.map(
     (personId,i)=>({personId,contractId:"contract-"+i+"-"+unique})),
     scriptedWinner:winner,plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
     plannedLengthMinutes:16})]);
   await tx.query(`INSERT INTO ppw_week_resource_clearances(
    world_id,year,week,eligible_promotions,inspected_slots,command_request_id)
    VALUES($1,1,1,1,1,'fixture')`,[worldId]);
  });
  const projection=await previewArchivedShowMatchScores(db.pool,{
   worldId,promotionId,showId});
  const effects=projection.projections[0]?.consequencesPreview?.performers;
  assert.equal(effects?.length,2);
  const byId=new Map(effects!.map(e=>[e.personId,e]));
  assert.equal(byId.get(winner)?.won,true);
  assert.equal(byId.get(loser)?.won,false);
  assert.ok(byId.get(winner)!.after.momentum>byId.get(winner)!.before.momentum);
  assert.ok(byId.get(loser)!.after.momentum<=byId.get(loser)!.before.momentum||
   projection.projections[0]!.score.criticalRatingStars>=4);
  // The World resolver inserts immutable completed match facts before career
  // settlement. This fixture supplies that exact FK contract (not fake careers).
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,
    crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,'regression',75,'{}'::jsonb,repeat('a',64))`,
    [worldId,promotionId,showId]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(
    world_id,show_id,match_id,position,crowd_response,
    actual_finish,actual_winner_side)
    VALUES($1,$2,'main',0,75,'CLEAN_PIN','A')`,[worldId,showId]);
  });
  const readHistory=()=>withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;won:boolean;performer_side:string;actual_winner_side:string;
   before_stats:{momentum:number};after_stats:{momentum:number}
  }>(`SELECT person_id,won,performer_side,actual_winner_side,before_stats,after_stats
    FROM ppw_individual_field_career_effects
    WHERE world_id=$1 AND show_id=$2 ORDER BY person_id`,[worldId,showId]));
  const before=await inspect();
  await assert.rejects(withWorldTransaction(db.pool,async tx=>{
   const result=await settleCanonicalSinglesCareerConsequences(tx,projection);
   assert.deepEqual(result,{performers:2,matches:1});
   throw new Error("intentional settlement rollback");
  }),/intentional settlement rollback/);
  assert.deepEqual(await inspect(),before,"A failed certification cannot award momentum");
  assert.equal((await readHistory()).length,0,
   "A failed certification cannot persist a fabricated career result");
  const result=await withWorldTransaction(db.pool,tx=>
   settleCanonicalSinglesCareerConsequences(tx,projection));
  assert.deepEqual(result,{performers:2,matches:1});
  const records=await readHistory();
  assert.equal(records.length,2,"Exact singles result is present in the original career ledger");
  assert.deepEqual(records.map(r=>r.won),[false,true],
   "Both winner and loser are recorded, not just the winning wrestler");
  assert.equal(records.find(r=>r.person_id===winner)!.actual_winner_side,"A");
  assert.equal(records.find(r=>r.person_id===winner)!.performer_side,"A");
  assert.ok(records.find(r=>r.person_id===winner)!.after_stats.momentum>
   records.find(r=>r.person_id===winner)!.before_stats.momentum);
  const after=await inspect();
  for(const p of after){
   const e=byId.get(p.person_id)!;
   for(const key of ["fatigue","wear","momentum","popularity","recognition"] as const)
    assert.ok(Math.abs(p[key]-e.after[key])<.00001,
     "Actual singles "+key+" must equal verified match consequences");
  }
  await assert.rejects(withWorldTransaction(db.pool,tx=>
   settleCanonicalSinglesCareerConsequences(tx,projection)),
   /baseline moved/,"The same match cannot apply momentum twice");
  const previous=after.find(p=>p.person_id===winner)!;
  await withWorldTransaction(db.pool,tx=>applyVerifiedMedicalLoadInTransaction(tx,
   worldId,[{personId:winner,severity:"MINOR",weeksOut:1}],people));
  const injured=(await inspect()).find(p=>p.person_id===winner)!;
  assert.equal(injured.status,"INJURED");
  assert.equal(injured.fatigue,previous.fatigue);
  assert.equal(injured.wear,previous.wear,
   "Simulated injury wear was already applied in the match consequences");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_individual_field_career_effects WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_completed_show_matches WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
