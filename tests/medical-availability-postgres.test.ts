import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {recordVerifiedMedicalAbsencesInTransaction,
 settleMedicalAvailabilityForNewWeek,settleWeeklyFatigueRecovery,
 applyVerifiedMedicalLoadInTransaction} from "../src/db/medical-availability.js";
import {readBookableCardTalent} from "../src/db/show-card-editor.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {dismissResolvedOfferAttention,dismissResolvedAttentionBatch} from "../src/db/player-attention-dismissals.js";

const url=process.env.PPW_NEON_TEST_URL;
test("verified injuries block next-week booking, recover on original schedule and notify exactly once",{
 skip:!url?"Disposable PostgreSQL not configured":false
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const world="medical-"+id,promo="promo-"+id,person="person-"+id,
  player="player-"+id,show="injury-show-"+id,card="next-show-"+id;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Medical World",seed:17,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promo,name:"Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",[world,player,promo]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,stamina,fatigue,wear) VALUES($1,$2,'Test Wrestler','MEN',60,20,10)",[world,person]);
   await tx.query(`INSERT INTO ppw_contracts
    (world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
    VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',4,100)`,
    [world,"deal-"+id,person,promo]);
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status) VALUES($1,$2,$3,1,52,'SUBMITTED')`,
    [world,show,promo]);
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
     receipt_json,receipt_digest) VALUES($1,$2,$3,1,52,$4,85,'{}'::jsonb,$5)`,
    [world,promo,show,"resolution-"+id,"a".repeat(64)]);
   const accepted=await recordVerifiedMedicalAbsencesInTransaction(tx,{
    worldId:world,showId:show,year:1,week:52,
    facts:[{matchId:"match",injuries:[{personId:person,severity:"MAJOR",weeksOut:2}]}]
   });
   await applyVerifiedMedicalLoadInTransaction(tx,world,accepted);
   const state=await tx.query<{status:string;fatigue:number;wear:number}>(
    "SELECT status,fatigue,wear FROM ppw_people WHERE world_id=$1 AND person_id=$2",
    [world,person]);
   assert.deepEqual(state[0],{status:"INJURED",fatigue:65,wear:13});
   await tx.query("UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)
    VALUES($1,$2,$3,2,1,'DRAFT')`,[world,card,promo]);
   await settleMedicalAvailabilityForNewWeek(tx,world,52,2,1);
   await tx.query("UPDATE ppw_people SET fatigue=50,stamina=60 WHERE world_id=$1 AND person_id=$2",
    [world,person]);
   await settleWeeklyFatigueRecovery(tx,world);
  });
  const injured=await readBookableCardTalent(db.pool,{
   worldId:world,playerId:player,promotionId:promo,showId:card});
  assert.equal(injured.talent.length,1);
  const restAtFirst=await withSqlClient(db.pool,tx=>tx.query<{fatigue:number}>(
   "SELECT fatigue FROM ppw_people WHERE world_id=$1 AND person_id=$2",[world,person]));
  assert.equal(restAtFirst[0]?.fatigue,31,"Original 14 + stamina/12 weekly recovery");
  assert.equal(injured.talent[0]?.available,false);
  assert.equal(injured.talent[0]?.reason,"INJURED");
  assert.equal(injured.talent[0]?.medicalWeeksRemaining,1);
  const before=await withSqlClient(db.pool,tx=>tx.query<{status:string;cleared_week_index:number}>(
   "SELECT status,cleared_week_index FROM ppw_medical_absences WHERE world_id=$1 AND person_id=$2",[world,person]));
  assert.deepEqual(before[0],{status:"ACTIVE",cleared_week_index:53});
  // Simulate a pre-upgrade saved World: match facts exist, but medical tracking
  // did not yet exist. Reconcile exactly once, without changing its clock.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_completed_show_matches
    (world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,$2,'match',0,85,'CLEAN_PIN','A')`,[world,show]);
   await tx.query(`INSERT INTO ppw_completed_match_report_facts
    (world_id,show_id,match_id,rating_stars,execution_quality,
     chemistry_modifier,actual_minutes,injuries_json)
    VALUES($1,$2,'match',4.0,80,0,17,$3::jsonb)`,[
     world,show,JSON.stringify([{person_id:person,injury_severity:"MAJOR",
      injury_weeks_out:2}])
    ]);
   await tx.query("DELETE FROM ppw_medical_absences WHERE world_id=$1",[world]);
   const migration=readFileSync(
    "db/migrations/0083_medical_saved_world_reconciliation.sql","utf8");
   await tx.query(migration,[]);
   await tx.query(migration,[]);
  });
  const reconciled=await withSqlClient(db.pool,tx=>tx.query<{
   n:string;cleared_week_index:number;status:string
  }>("SELECT count(*)::text AS n,min(cleared_week_index) AS cleared_week_index,"+
   " min(status) AS status FROM ppw_medical_absences WHERE world_id=$1",[world]));
  assert.deepEqual(reconciled[0],{n:"1",cleared_week_index:53,status:"ACTIVE"});
  await withWorldTransaction(db.pool,async tx=>{
   await settleMedicalAvailabilityForNewWeek(tx,world,53,2,2);
   await settleWeeklyFatigueRecovery(tx,world);
   await settleMedicalAvailabilityForNewWeek(tx,world,53,2,2);
   await tx.query("UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[world]);
   await tx.query("UPDATE ppw_booking_drafts SET week=2 WHERE world_id=$1 AND draft_id=$2",[world,card]);
  });
  const cleared=await readBookableCardTalent(db.pool,{
   worldId:world,playerId:player,promotionId:promo,showId:card});
  assert.equal(cleared.talent[0]?.available,true);
  const restAtSecond=await withSqlClient(db.pool,tx=>tx.query<{fatigue:number}>(
   "SELECT fatigue FROM ppw_people WHERE world_id=$1 AND person_id=$2",[world,person]));
  assert.equal(restAtSecond[0]?.fatigue,12);
  assert.equal(cleared.talent[0]?.reason,"AVAILABLE");
  assert.equal(cleared.talent[0]?.medicalWeeksRemaining,null);
  const status=await withSqlClient(db.pool,tx=>tx.query<{status:string}>(
   "SELECT status FROM ppw_people WHERE world_id=$1 AND person_id=$2",[world,person]));
  assert.equal(status[0]?.status,"ACTIVE");
  const news=await withSqlClient(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_ledger_events WHERE world_id=$1 AND event_type='WRESTLER_CLEARED_TO_RETURN'",[world]));
  assert.equal(news[0]?.n,"1");
  const owner=await readPlayerWorldOverview(db.pool,world,player);
  const clearances=owner?.promotion?.attention.medicalClearances??[];
  assert.equal(clearances.length,1,"The controller sees one genuine medical clearance");
  assert.equal(clearances[0]?.personId,person);
  assert.match(clearances[0]!.id,/^medical-clearance:[1-9][0-9]*:[0-9a-f]{32}$/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId:promo,playerId:"intruder",attentionId:clearances[0]!.id
  }),/unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId:promo,playerId:player,
   attentionIds:[clearances[0]!.id,"medical-clearance:999999999999:"+"a".repeat(32)]
  }),/unavailable|cannot be dismissed/);
  assert.equal((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.medicalClearances?.length,1);
  const dismissed=await dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId:promo,playerId:player,
   attentionIds:[clearances[0]!.id]});
  assert.deepEqual(dismissed,{dismissed:1,firstDismissals:1});
  assert.deepEqual((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.medicalClearances,[]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_player_attention_dismissals","ppw_medical_absences",
    "ppw_completed_match_report_facts","ppw_completed_show_matches","ppw_completed_shows","ppw_booking_drafts","ppw_contracts","ppw_promotion_controls","ppw_memberships","ppw_people","ppw_promotions"]){
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   }
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
