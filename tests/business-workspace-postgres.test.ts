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
  assert.equal(business.homeMarketName,"Territory 0",
   "The promotion's founding territory comes from its own market, not any rival");
  assert.deepEqual(business.standing,{
   prestige:82,fanReputation:78,businessReputation:82,
   talentReputation:74,lastEvaluatedYear:0
  });
  assert.equal(business.mediaReach,90,
   "Keep the original broadcast distribution measure, not a derived estimate");
  assert.deepEqual(business.rollingFourWeeks,{
   income:0,spending:0,net:0,byCategory:[]
  });
  assert.deepEqual(business.recentTransactions,[]);
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
  assert.equal(business.territories[0]!.strongestRival,"Promotion 7");
  assert.equal(business.territories[0]!.rivalLiveStrength,57);
  assert.ok(business.territories.every(t=>t.strongestRival!==null),
   "Known rivals use already recorded territory populations, never guesses");
  const budget=meter.assertBudget({maxQueries:3,maxResultBytes:12000});
  assert.equal(budget.queryCount,3);
  assert.ok(budget.resultRows<=6);
  const actorRead=await dispatchCardRpc({pool:db.pool,actor:{playerId:owner}},"business",{
   worldId:world,promotionId:promotion,playerId:"forged"}) as unknown as
    Awaited<ReturnType<typeof readBusinessWorkspace>>;
  assert.equal(actorRead.name,"Promotion 0");
  assert.equal(actorRead.homeMarketName,"Territory 0");
  assert.equal(actorRead.mediaReach,90);
  assert.deepEqual(actorRead.standing,business.standing);
  // A historical World without a verified record must never get invented scores.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "DELETE FROM ppw_promotion_standings WHERE world_id=$1 AND promotion_id=$2",
   [world,promotion]));
  const historical=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(historical.standing,null);
  // The journal is the sole cash source. A show's appearance fees are already
  // debited by the contract ledger and MUST NOT be paid twice in activity.
  await withWorldTransaction(db.pool,async tx=>{
   const events=[
    ["PROMOTION_RECURRING_FINANCES",{promotionId:promotion,mediaIncome:300000,
     sponsorIncome:25000,fixedOverhead:60000,staffCost:5000,net:260000}],
    ["CONTRACT_GUARANTEE_PAID",{promotionId:promotion,amount:18000}],
    ["CONTRACT_EXTRA_DATES_ACCEPTED",{promotionId:promotion,additionalPayment:12500}],
    ["CONTRACT_APPEARANCE_FEES",{promotionId:promotion,amount:20000}],
    ["SHOW_EVENT_ECONOMICS",{promotionId:promotion,gateRevenue:150000,
     venueCost:20000,productionCost:30000,travelCost:10000,
     appearanceFees:20000,incrementalCash:90000,eventNet:70000}]
   ];
   await tx.query(`
    INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    SELECT $1,1,1,x.event_type,x.payload
    FROM jsonb_to_recordset($2::jsonb) AS x(event_type text,payload jsonb)`,
    [world,JSON.stringify(events.map(([event_type,payload])=>({event_type,payload})))]);
  });
  const activity=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(activity.rollingFourWeeks.income,475000);
  assert.equal(activity.rollingFourWeeks.spending,175500);
  assert.equal(activity.rollingFourWeeks.net,299500);
  assert.equal(activity.rollingFourWeeks.byCategory.find(x=>x.category==="APPEARANCE_FEE")?.amount,-20000);
  assert.equal(activity.rollingFourWeeks.byCategory.find(x=>x.category==="GATE_REVENUE")?.amount,150000);
  assert.equal(activity.recentTransactions.length,8);
  assert.equal(activity.recentTransactions[0]?.category,"GATE_REVENUE");
  assert.equal(activity.cash,5_000_000,
   "Reporting canonical ledger entries must never repeat cash settlement");
  // Same evidence across Y1 W52 -> Y2 W1 stays in the rolling window.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,1,52,'CONTRACT_SIGNED',$2::jsonb)`,
    [world,JSON.stringify({promotionId:promotion,signingBonus:4300})]);
  });
  const rollover=await readBusinessWorkspace(db.pool,{
   worldId:world,promotionId:promotion,playerId:owner});
  assert.equal(rollover.rollingFourWeeks.net,-4300);
  assert.equal(rollover.rollingFourWeeks.income,0);
  assert.equal(rollover.rollingFourWeeks.spending,4300);
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
