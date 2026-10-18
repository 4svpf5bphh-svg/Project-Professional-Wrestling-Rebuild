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
import {readSixWeekPlanner} from "../src/db/planner-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Venue planning reveals rival presence and market potential in four bounded queries",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="territory-"+randomUUID(),player="promoter-"+randomUUID();
 const pool=postgresPool(url!,4),promotionId="promotion-0";
 try{
  await importOriginalGenesis(pool.pool,originalGenesisFixture(world));
  await joinWorld(pool.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(pool.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  const meter=new MeasuredQuerySession("rival-territory-planner");
  const measured:TransactionPool={async connect(){
   const client=await pool.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const scope={worldId:world,promotionId,playerId:player};
  const view=await readSixWeekPlanner(measured,scope);
  const budget=meter.assertBudget({maxQueries:4,maxResultBytes:20000});
  assert.equal(budget.queryCount,4);
  assert.equal(view.weeks.length,6);
  assert.equal(view.homeMarketId,"market-0");
  const home=view.venues.find(x=>x.home);
  assert.ok(home);
  assert.equal(home.marketName,"Territory 0");
  assert.equal(home.audiencePotential,65);
  assert.equal(home.wrestlingInterest,70);
  assert.equal(home.spendingIndex,90);
  assert.equal(home.liveStrength,50);
  assert.equal(home.prestige,55);
  assert.equal(home.productionSuitability,80);
  assert.deepEqual(home.strongestRival,{name:"Promotion 7",tier:"INDEPENDENT",
   liveStrength:57,basedHere:false});
  assert.equal(view.venues.filter(x=>x.marketId==="market-0").length,4);
  await assert.rejects(readSixWeekPlanner(pool.pool,{...scope,playerId:"impostor"}),/access denied/i);
 }finally{
  await withWorldTransaction(pool.pool,async tx=>{
   for(const table of ["ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>pool.close());
 }
});
