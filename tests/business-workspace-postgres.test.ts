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
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Private Business dashboard preserves exact Genesis financial data, territory state and fixed query budget",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="business-"+randomUUID(),owner="owner-"+randomUUID();
 const db=postgresPool(url!,3),promotion="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owner,
   requestId:"business-join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owner,
   promotionId:promotion,requestId:"business-claim",expectedRevision:1})).status,"APPLIED");
  const meter=new MeasuredQuerySession("business-workspace-indexed");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const business=await readBusinessWorkspace(measured,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(business.name,"Promotion 0");
  assert.equal(business.cash,5_000_000);
  assert.equal(business.weeklyMediaIncome,300_000);
  assert.equal(business.weeklySponsorIncome,25_000);
  assert.equal(business.weeklyFixedOverhead,60_000);
  assert.equal(business.weeklyGuarantees,50*0+
   originalGenesisFixture(world).contracts.filter(c=>c.promotionId===promotion)
   .reduce((total,c)=>total+c.weeklyGuarantee,0));
  assert.equal(business.recurringMargin,325000-60000-business.weeklyGuarantees);
  assert.equal(business.lastWeeklyNet,0);
  assert.equal(business.shows.length,0);
  assert.equal(business.territories.length,4);
  assert.equal(business.territories[0]!.isHome,true);
  assert.equal(business.territories[0]!.name,"Territory 0");
  const budget=meter.assertBudget({maxQueries:3,maxResultBytes:12000});
  assert.equal(budget.queryCount,3);
  assert.ok(budget.resultRows<=6);
  const actorRead=await dispatchCardRpc({pool:db.pool,actor:{playerId:owner}},"business",{
   worldId:world,promotionId:promotion,playerId:"forged"}) as unknown as
    Awaited<ReturnType<typeof readBusinessWorkspace>>;
  assert.equal(actorRead.name,"Promotion 0");
  // A real economics receipt is displayed as an archived fact, not
  // recomputed or applied twice to the promotion's cash.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,show_name,event_type)
     VALUES($1,'business-show','promotion-0',1,1,'SUBMITTED',2,'Saturday Spectacular','REGULAR')`,
     [world]);
   await tx.query(`INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
     VALUES($1,'promotion-0','business-show',1,1,'business-fixture',77,'{}'::jsonb,repeat('b',64))`,
     [world]);
   await tx.query(`INSERT INTO ppw_show_economics
     (world_id,show_id,promotion_id,year,week,attendance,expected_demand,
      gate_revenue,venue_cost,production_cost,travel_cost,appearance_fees,
      total_cost,net_result,incremental_cash)
     VALUES($1,'business-show','promotion-0',1,1,900,1100,
      150000,20000,30000,10000,20000,80000,70000,70000)`,[world]);
  });
  const settled=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(settled.shows.length,1);
  assert.equal(settled.shows[0]!.name,"Saturday Spectacular");
  assert.equal(settled.shows[0]!.gateRevenue,150000);
  assert.equal(settled.shows[0]!.totalCost,80000);
  assert.equal(settled.shows[0]!.netResult,70000);
  assert.equal(settled.cash,5_000_000,"Finance reporting does not settle money twice");
  await assert.rejects(readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:"unauthorised"}),/access denied/);
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId:"unauthorised"}},
   "business",{worldId:world,promotionId:promotion,playerId:owner}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_show_economics","ppw_completed_shows",
    "ppw_booking_drafts","ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[owner]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
