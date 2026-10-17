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
import {readWrestlerDirectory,validateDirectoryFilter}
 from "../src/db/wrestler-directory.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
import type {OfferTerms} from "../src/domain/contract-economics.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Roster and talent market validate paging, offer rights and two-query directory budget",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="directory-"+randomUUID(),player="booker-"+randomUUID();
 const db=postgresPool(url!,4),promotionId="promotion-0";
 const fixture=originalGenesisFixture(world,120);
 fixture.contracts.splice(fixture.contracts.findIndex(x=>x.personId==="person-87"),1);
 const context={pool:db.pool,actor:{playerId:player}};
 try{
  await importOriginalGenesis(db.pool,fixture);
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:player,
   requestId:"join",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1})).status,"APPLIED");
  const owned=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"ROSTER",limit:40});
  assert.equal(owned.people.length,15);
  assert.ok(owned.people.every(x=>x.contractId!==null));
  const exclusive=owned.people.find(x=>x.personId==="person-0")!;
  assert.equal(exclusive.availability,"YOUR_ROSTER");
  assert.equal(exclusive.remainingDates,null);
  const young=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 87",division:"WOMEN",limit:5});
  assert.deepEqual(young.people.map(x=>x.personId),["person-87"]);
  assert.equal(young.people[0]!.availability,"FREE_AGENT");
  const blocked=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 5"});
  assert.equal(blocked.people[0]!.availability,"EXCLUSIVE_ELSEWHERE");
  const approachable=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 5",availability:"APPROACHABLE"});
  assert.ok(!approachable.people.some(x=>x.personId==="person-5"));
  const first=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",limit:5,sort:"POPULARITY"});
  const next=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",limit:5,sort:"POPULARITY",offset:5});
  assert.equal(first.people.length,5);assert.equal(next.people.length,5);
  assert.equal(first.hasMore,true);
  assert.equal(new Set([...first.people,...next.people].map(x=>x.personId)).size,10);
  assert.ok(first.people[0]!.popularity!>=first.people[4]!.popularity!);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",limit:500}),/Invalid/);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",offset:-1}),/Invalid/);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",minPopularity:101}),/threshold/);
  await assert.rejects(readWrestlerDirectory(db.pool,{
   worldId:world,playerId:"someone-else",promotionId},{view:"ROSTER"}),/access denied/);
  const meter=new MeasuredQuerySession("mobile-roster-page");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const sample=await readWrestlerDirectory(measured,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",limit:25});
  assert.equal(sample.people.length,25);
  assert.equal(meter.assertBudget({maxQueries:2,maxResultBytes:18000}).queryCount,2);
  // Real card RPC uses the actor from auth, not a browser-provided ID.
  const rpc=await dispatchCardRpc(context,"wrestlerDirectory",{
   worldId:world,promotionId,playerId:"attacker",filter:{view:"ROSTER",limit:5}}) as unknown as Awaited<ReturnType<typeof readWrestlerDirectory>>;
  assert.equal(rpc.people.length,5);
  const terms:OfferTerms={family:"LIMITED_NON_EXCLUSIVE",roleExpectation:"FEATURED",
   creativeControl:"CONSULTATION",startWeekIndex:0,termWeeks:8,
   dateEntitlement:4,weeklyGuarantee:0,appearanceFee:9000,signingBonus:1000};
  const offer=await dispatchCardRpc(context,"submitContractOffer",{
   worldId:world,promotionId,requestId:"directory-offer",expectedRevision:2,
   personId:"person-87",terms}) as {status:string};
  assert.equal(offer.status,"APPLIED");
  assert.equal((await dispatchCardRpc(context,"submitContractOffer",{
   worldId:world,promotionId,requestId:"directory-offer",expectedRevision:2,
   personId:"person-87",terms}) as {status:string}).status,"REPLAYED");
  const refreshed=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 87"});
  assert.equal(refreshed.people[0]!.pendingOffer,true);
  assert.equal(refreshed.people[0]!.activeContracts,0,
   "An offer does not manufacture an agreed employment contract");
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId:"intruder"}},
   "submitContractOffer",{worldId:world,promotionId,requestId:"hijack",
    expectedRevision:3,personId:"person-87",terms}),/access denied/);
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
