import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
import {dismissResolvedOfferAttention,dismissResolvedAttentionBatch}
 from "../src/db/player-attention-dismissals.js";

const url=process.env.PPW_NEON_TEST_URL;
test("Original Genesis: extra-date acceptances and refusals are scoped, dismissible and kept in Contract Desk",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="dates-news-"+randomUUID(),player="booker-"+randomUUID();
 const db=postgresPool(url!,3),promotionId="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,40));
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,1,1,'CONTRACT_EXTRA_DATES_DECIDED',jsonb_build_object(
    'promotionId','promotion-0','contractId','contract-A',
    'personId','person-0','status','ACCEPTED','additionalDates',3,
    'additionalPayment',500)),
   ($1,1,1,'CONTRACT_EXTRA_DATES_DECIDED',jsonb_build_object(
    'promotionId','promotion-0','contractId','contract-B',
    'personId','person-8','status','REJECTED','additionalDates',2,
    'additionalPayment',0)),
   ($1,1,1,'CONTRACT_EXTRA_DATES_DECIDED',jsonb_build_object(
    'promotionId','promotion-1','contractId','private-rival',
    'personId','person-1','status','ACCEPTED','additionalDates',5,
    'additionalPayment',999))
   `,[world]));
  const overview=await readPlayerWorldOverview(db.pool,world,player);
  const news=overview?.promotion?.attention.dateDecisions??[];
  assert.equal(news.length,2);
  assert.deepEqual(news.map(x=>[x.status,x.additionalDates,x.contractId]).sort(),[
   ["ACCEPTED",3,"contract-A"],["REJECTED",2,"contract-B"]
  ]);
  const desk=await readContractDesk(db.pool,world,player,promotionId);
  assert.equal(desk.dateDecisions.length,2);
  assert.ok(desk.dateDecisions.every(x=>x.contractId!=="private-rival"));
  assert.equal(desk.dateDecisions.find(x=>x.status==="ACCEPTED")?.additionalPayment,500);
  const revision=overview!.world.revision;
  await assert.rejects(dismissResolvedOfferAttention(db.pool,{
   worldId:world,promotionId,playerId:"stranger",attentionId:news[0]!.id}),
   /unavailable|cannot be dismissed/);
  await assert.rejects(dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,attentionIds:[
    news[0]!.id,"contract-dates:999999999"]}),/unavailable|cannot be dismissed/);
  assert.equal((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.dateDecisions?.length,2);
  assert.deepEqual(await dismissResolvedAttentionBatch(db.pool,{
   worldId:world,promotionId,playerId:player,attentionIds:news.map(x=>x.id)}),
   {dismissed:2,firstDismissals:2});
  assert.deepEqual((await readPlayerWorldOverview(db.pool,world,player))
   ?.promotion?.attention.dateDecisions,[]);
  assert.equal((await readContractDesk(db.pool,world,player,promotionId))
   .dateDecisions.length,2,"Dismissing Home news must not erase the decision history");
  assert.equal((await readPlayerWorldOverview(db.pool,world,player))?.world.revision,revision);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_player_attention_dismissals","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contract_date_requests","ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contracts","ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotion_standings",
    "ppw_promotions","ppw_markets"]){
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   }
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
