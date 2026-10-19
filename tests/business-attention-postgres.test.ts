import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {dismissResolvedOfferAttention,dismissResolvedAttentionBatch}
 from "../src/db/player-attention-dismissals.js";
const url=process.env.PPW_NEON_TEST_URL;
test("private annual and financial notices survive year boundary, dismiss individually and in a batch",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,4),world="business-news-"+randomUUID(),
  alice="alice-"+randomUUID(),bob="bob-"+randomUUID(),promotion="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,40));
  await joinWorld(db.pool,{worldId:world,playerId:alice,requestId:"join-a",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:alice,
   promotionId:promotion,requestId:"claim-a",expectedRevision:1});
  await joinWorld(db.pool,{worldId:world,playerId:bob,requestId:"join-b",expectedRevision:2});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:bob,
   promotionId:"promotion-1",requestId:"claim-b",expectedRevision:3});
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload) VALUES
     ($1,1,52,'PROMOTION_STANDING_UPDATED',
      '{"promotionId":"promotion-0","prestigeDelta":1.8,"prestige":81.8}'::jsonb),
     ($1,2,1,'FINANCIAL_DISTRESS_CHANGED',
      '{"promotionId":"promotion-0","from":"HEALTHY","to":"WATCH"}'::jsonb),
     ($1,2,1,'FINANCIAL_DISTRESS_CHANGED',
      '{"promotionId":"promotion-1","from":"CRISIS","to":"HEALTHY"}'::jsonb),
     ($1,2,1,'WORLD_WEEK_COMPLETED',
      '{"promotionId":"promotion-0"}'::jsonb),
     ($1,2,1,'FINANCIAL_DISTRESS_CHANGED',
      '{"promotionId":"promotion-0","from":"WATCH","to":"WATCH"}'::jsonb)
   `,[world]);
  });
  const meter=new MeasuredQuerySession("owner-private-company-news");
  const measured:TransactionPool={async connect(){
   const x=await db.pool.connect();
   return {release(){x.release();},async query<T extends Record<string,unknown>>(
     sql:string,params:readonly unknown[]=[]){return meter.execute(()=>x.query<T>(sql,params));}};
  }};
  const home=await readPlayerWorldOverview(measured,world,alice);
  assert.equal(meter.assertBudget({maxQueries:1,maxResultBytes:4800}).queryCount,1);
  assert.equal(home?.world.year,2);
  assert.equal(home?.promotion?.attention.businessUpdates?.length,2);
  const updates=home!.promotion!.attention.businessUpdates!;
  assert.deepEqual(updates.map(x=>x.kind).sort(),["ANNUAL_REVIEW","FINANCIAL_HEALTH"]);
  assert.deepEqual(updates.find(x=>x.kind==="ANNUAL_REVIEW")?.prestigeDelta,1.8);
  assert.deepEqual(updates.find(x=>x.kind==="FINANCIAL_HEALTH")?.after,"WATCH");
  assert.equal(home?.promotion?.attention.plannedShows,0,"Urgent show remains independent");
  const enemy=await readPlayerWorldOverview(db.pool,world,bob);
  assert.deepEqual(enemy?.promotion?.attention.businessUpdates?.map(x=>x.after),["HEALTHY"]);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId:promotion,playerId:bob,attentionId:updates[0]!.id
  }),/unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId:promotion,playerId:alice,
   attentionId:"business-update:../../../../../forged"
  }),/Invalid dismissible/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId:promotion,playerId:alice,
   attentionIds:[updates[0]!.id,"business-update:999999999"]
  }),/unavailable|cannot be dismissed/);
  const one=await dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId:promotion,playerId:alice,attentionId:updates[0]!.id
  });
  assert.deepEqual(one,{dismissed:true,firstDismissal:true});
  const home2=await readPlayerWorldOverview(db.pool,world,alice);
  assert.equal(home2?.promotion?.attention.businessUpdates?.length,1);
  const batch=await dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId:promotion,playerId:alice,
   attentionIds:[home2!.promotion!.attention.businessUpdates![0]!.id]
  });
  assert.deepEqual(batch,{dismissed:1,firstDismissals:1});
  assert.deepEqual((await readPlayerWorldOverview(db.pool,world,alice))
   ?.promotion?.attention.businessUpdates,[]);
  assert.equal((await readPlayerWorldOverview(db.pool,world,alice))?.promotion
   ?.attention.plannedShows,0);
  assert.equal((await readPlayerWorldOverview(db.pool,world,bob))?.promotion
   ?.attention.businessUpdates?.length,1,"Another player's company news remains visible");
  const revision=await withWorldTransaction(db.pool,tx=>tx.query<{revision:string}>(
   "SELECT revision::text FROM ppw_worlds WHERE world_id=$1",[world]));
  assert.equal(revision[0]!.revision,"4","Dismissing news never advances the World");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET year=2,week=14 WHERE world_id=$1",[world]));
  assert.deepEqual((await readPlayerWorldOverview(db.pool,world,bob))
   ?.promotion?.attention.businessUpdates,[],"Old company notices age out naturally");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const t of ["ppw_player_attention_dismissals","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contract_offers","ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_contracts","ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotion_standings","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+t+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[alice,bob]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
