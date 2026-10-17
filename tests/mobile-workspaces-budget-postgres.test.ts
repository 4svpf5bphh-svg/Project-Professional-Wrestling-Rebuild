import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readPlayerWorldOverview} from "../src/db/player-world-overview.js";
import {readWrestlerDirectory} from "../src/db/wrestler-directory.js";
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {readIndustryWorldHub} from "../src/db/industry-world-hub.js";
const url=process.env.PPW_NEON_TEST_URL;

/** Worst ordinary mobile work session: all six full UI screens in one visit.
 * Full 643-person Genesis, not a toy roster. No polling, history hydration,
 * per-person query, separate server read-model or second World.
 * The meter measures actual returned PostgreSQL JSON bytes, not SQL guesses.
 */
test("643-wrestler iPhone session: Home, roster, market, Business, Staff and Industry fit a fixed SQL budget",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="mobile-budget-"+randomUUID(),player="booker-"+randomUUID();
 const db=postgresPool(url!,4),promotion="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,643));
  assert.equal((await joinWorld(db.pool,{worldId:world,
   playerId:player,requestId:"join-mobile",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,
   promotionId:promotion,playerId:player,
   requestId:"claim-mobile",expectedRevision:1})).status,"APPLIED");
  const meter=new MeasuredQuerySession("643-people-6-views-mobile-session");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const scope={worldId:world,promotionId:promotion,playerId:player};
  const overview=await readPlayerWorldOverview(measured,world,player);
  assert.equal(overview?.promotion?.id,promotion);
  assert.equal(meter.assertBudget({maxQueries:1,maxResultBytes:2200}).queryCount,1);
  const roster=await readWrestlerDirectory(measured,scope,{view:"ROSTER",limit:25});
  assert.equal(roster.view,"ROSTER");
  assert.ok(roster.people.length>0);
  assert.equal(meter.assertBudget({maxQueries:3,maxResultBytes:20000}).queryCount,3);
  const talent=await readWrestlerDirectory(measured,scope,{view:"MARKET",
   sort:"POPULARITY",limit:25,minRecognition:55});
  assert.ok(talent.people.length>0);
  assert.equal(meter.assertBudget({maxQueries:5,maxResultBytes:42000}).queryCount,5);
  const business=await readBusinessWorkspace(measured,scope);
  assert.equal(business.name,"Promotion 0");
  assert.equal(meter.assertBudget({maxQueries:8,maxResultBytes:60000}).queryCount,8);
  const staff=await readStaffWorkspace(measured,scope);
  assert.equal(staff.year,overview?.world.year);
  assert.equal(staff.autoRenewSameTerms,false);
  assert.equal(meter.assertBudget({maxQueries:10,maxResultBytes:70000}).queryCount,10);
  const industry=await readIndustryWorldHub(measured,scope);
  assert.equal(industry.promotions.length,8);
  const sample=meter.assertBudget({maxQueries:13,maxResultBytes:85000});
  assert.equal(sample.queryCount,13);
  assert.ok(sample.resultRows<150,
   "The mobile session must not load all 643 wrestlers into a client response");
  console.log("PPW 643-person iPhone session SQL budget:",JSON.stringify(sample));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
