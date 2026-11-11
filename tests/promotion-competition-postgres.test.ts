import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
import {reviewWorldPromotionCompetition}
 from "../src/db/promotion-competition.js";
const url=process.env.PPW_NEON_TEST_URL;
test("two human local managers get each other as their circuit rival, and tier growth moves a company to AI competition without another Home or Business query",{
 skip:!url?"Disposable PostgreSQL required":false
},async()=>{
 const world="world-rival-"+randomUUID(),a="a-"+randomUUID(),
  b="b-"+randomUUID(),db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  const j1=await joinWorld(db.pool,{worldId:world,playerId:a,
   requestId:"rival-human-join-a",expectedRevision:0});
  assert.equal(j1.status,"APPLIED");
  const ca=await submitPromotionClaim(db.pool,{worldId:world,
   promotionId:"promotion-0",playerId:a,requestId:"rival-human-claim-a",
   expectedRevision:1});
  assert.equal(ca.status,"APPLIED");
  const j2=await joinWorld(db.pool,{worldId:world,playerId:b,
   requestId:"rival-human-join-b",expectedRevision:2});
  assert.equal(j2.status,"APPLIED");
  const cb=await submitPromotionClaim(db.pool,{worldId:world,
   promotionId:"promotion-1",playerId:b,requestId:"rival-human-claim-b",
   expectedRevision:3});
  assert.equal(cb.status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    UPDATE ppw_promotions SET tier=CASE
     WHEN promotion_id IN ('promotion-0','promotion-1') THEN 'LOCAL'
     WHEN promotion_id='promotion-3' THEN 'RISING' ELSE 'NATIONAL' END,
    media_reach=CASE
     WHEN promotion_id='promotion-0' THEN 18
     WHEN promotion_id='promotion-1' THEN 20
     WHEN promotion_id='promotion-3' THEN 43 ELSE 85 END,
    home_market_id='market-0'
    WHERE world_id=$1`,[world]);
   for(const [promotion,attendance] of [
    ["promotion-0",820],["promotion-1",940],
    ["promotion-3",1400]] as const){
    const show="rival-cert-"+promotion;
    await tx.query(`
     INSERT INTO ppw_booking_drafts
      (world_id,draft_id,promotion_id,year,week,status,show_day,
       booking_class,event_type,show_name)
     VALUES($1,$2,$3,1,1,'SUBMITTED',5,'REGULAR','REGULAR','Weekly')`,
     [world,show,promotion]);
    await tx.query(`
     INSERT INTO ppw_completed_shows
      (world_id,promotion_id,show_id,year,week,resolution_id,
       crowd_response,receipt_json,receipt_digest)
     VALUES($1,$2,$3,1,1,$4,75,'{}'::jsonb,repeat('e',64))`,
     [world,promotion,show,show+":receipt"]);
    await tx.query(`
     INSERT INTO ppw_show_economics
      (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
       gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
       total_cost,net_result,incremental_cash)
     VALUES($1,$2,$3,1,1,$4,1600,200000,20000,30000,15000,
      25000,90000,110000,110000)`,[world,show,promotion,attendance]);
   }
  });
  const first=await withWorldTransaction(db.pool,tx=>
   reviewWorldPromotionCompetition(tx,world,1,1));
  assert.equal(first.evaluated,8);
  const replay=await withWorldTransaction(db.pool,tx=>
   reviewWorldPromotionCompetition(tx,world,1,1));
  assert.equal(replay.changed,0);
  const notDue=await withWorldTransaction(db.pool,tx=>
   reviewWorldPromotionCompetition(tx,world,1,2));
  assert.deepEqual(notDue,{evaluated:0,changed:0});
  const meter=new MeasuredQuerySession("home-competition-one-query");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const homeA=await readPlayerWorldOverview(measured,world,a);
  assert.equal(meter.assertBudget({maxQueries:1,maxResultBytes:8000}).queryCount,1);
  const homeB=await readPlayerWorldOverview(measured,world,b);
  assert.equal(meter.assertBudget({maxQueries:2,maxResultBytes:16000}).queryCount,2);
  assert.equal(homeA?.promotion?.competition?.promotionId,"promotion-1");
  assert.equal(homeB?.promotion?.competition?.promotionId,"promotion-0");
  assert.equal(homeA?.promotion?.competition?.humanManaged,true);
  assert.equal(homeA?.promotion?.competition?.ownAvgAttendance,820);
  assert.equal(homeA?.promotion?.competition?.rivalAvgAttendance,940);
  const businessA=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:"promotion-0",playerId:a});
  assert.equal(businessA.competition?.promotionId,"promotion-1");
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_promotions SET tier='RISING',media_reach=44
   WHERE world_id=$1 AND promotion_id='promotion-0'`,[world]));
  const matured=await withWorldTransaction(db.pool,tx=>
   reviewWorldPromotionCompetition(tx,world,1,9));
  assert.ok(matured.changed>=1);
  const newer=await readPlayerWorldOverview(db.pool,world,a);
  assert.equal(newer?.promotion?.competition?.promotionId,"promotion-3");
  assert.equal(newer?.promotion?.competition?.humanManaged,false);
  assert.equal(newer?.promotion?.competition?.reviewedWeekIndex,8);
  assert.equal(newer?.promotion?.competition?.sinceWeekIndex,8);
  assert.equal((await readPlayerWorldOverview(db.pool,world,b))
   ?.promotion?.competition?.humanManaged,true);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_promotion_competition",
    "ppw_commercial_bonus_receipts","ppw_commercial_deals",
    "ppw_show_economics","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts",
    "ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id IN ($1,$2)",[a,b]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
