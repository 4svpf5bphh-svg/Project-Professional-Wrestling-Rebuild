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
  // A future agreement is visible with its start date, not as
  // an eligible wrestler on the current week's booking card.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET start_week_index=2 WHERE world_id=$1 AND person_id='person-0'",
   [world]));
  const deferred=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"ROSTER",search:"Wrestler 0"});
  assert.equal(deferred.people.find(x=>x.personId==="person-0")?.availability,
   "SIGNED_FUTURE_YOURS");
  assert.equal(deferred.people.find(x=>x.personId==="person-0")?.startsInWeeks,2);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET start_week_index=0 WHERE world_id=$1 AND person_id='person-0'",
   [world]));
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
  // Restored original PPW talent filters must remain inside the same two
  // bounded SQL reads; this protects the Neon optimisation.
  const interestOrder=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",limit:25,sort:"INTEREST"});
  assert.equal(interestOrder.people.length,25);
  assert.ok(interestOrder.people.every(x=>
   ["KEEN","INTERESTED","OPEN_TO_TALKS","RELUCTANT",
    "NOT_INTERESTED","UNAVAILABLE","UNKNOWN"].includes(x.interest)));
  assert.equal(blocked.people[0]!.interest,"UNAVAILABLE");
  const openToTalks=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",limit:25,interest:"OPEN_PLUS"});
  assert.ok(openToTalks.people.every(x=>
   ["KEEN","INTERESTED","OPEN_TO_TALKS"].includes(x.interest)));
  const interestMeter=new MeasuredQuerySession("talent-market-interest");
  const budgetPool:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return interestMeter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  await readWrestlerDirectory(budgetPool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",sort:"INTEREST",interest:"OPEN_PLUS",limit:25});
  assert.equal(interestMeter.assertBudget({maxQueries:2,maxResultBytes:18000}).queryCount,2);
  const roles=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"ROSTER",role:"FEATURED",sort:"ROLE",limit:40});
  assert.ok(roles.people.every(x=>x.roleExpectation==="FEATURED"));
  const womenRoster=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"ROSTER",division:"WOMEN",limit:40});
  assert.ok(womenRoster.people.every(x=>x.division==="WOMEN"));
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",interest:"INVALID" as "ALL"}),/Invalid/);
  assert.throws(()=>validateDirectoryFilter({view:"ROSTER",role:"INVALID" as "ALL"}),/Invalid/);
  assert.ok(first.people[0]!.popularity!>=first.people[4]!.popularity!);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",limit:500}),/Invalid/);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",offset:-1}),/Invalid/);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",minPopularity:101}),/threshold/);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",minPresentation:-1}),/threshold/);
  assert.throws(()=>validateDirectoryFilter({view:"MARKET",minInRing:101}),/threshold/);
  const strongRing=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",minInRing:85,limit:12});
  assert.ok(strongRing.people.every(p=>p.inRingQuality!==null&&p.inRingQuality>=85));
  const ringBlocked=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 87",minInRing:88});
  assert.deepEqual(ringBlocked.people,[]);
  const feeSort=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"ROSTER",limit:40,sort:"FEE_HIGH"});
  assert.ok(feeSort.people.length>1);
  assert.ok(feeSort.people.every((p,i,all)=>i===0||
   (all[i-1]!.appearanceFee??0)>=(p.appearanceFee??0)));
  const affordable=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"MARKET",limit:7,sort:"VALUE",minPresentation:70});
  assert.ok(affordable.people.every(p=>p.presentation!==null&&p.presentation>=70));
  assert.ok(affordable.people.every(p=>p.estimatedWeeklyValue!==null));
  assert.ok(affordable.people[0]!.estimatedWeeklyValue! <=
   affordable.people[affordable.people.length-1]!.estimatedWeeklyValue!);
  const salaries=await readWrestlerDirectory(db.pool,{worldId:world,playerId:player,promotionId},
   {view:"ROSTER",limit:40,sort:"PAY_HIGH"});
  assert.ok(salaries.people[0]!.weeklyGuarantee! >= salaries.people[1]!.weeklyGuarantee!);
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
  // Future signed talent stays visible to their own manager but cannot be
  // booked yet. Rival future exclusives must not be called free agents.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET start_week_index=10 WHERE world_id=$1 AND contract_id='contract-8'",
   [world]));
  const futureRoster=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"ROSTER",search:"Wrestler 8"});
  assert.equal(futureRoster.people.find(p=>p.personId==="person-8")?.availability,
   "SIGNED_FUTURE_YOURS");
  assert.equal(futureRoster.people.find(p=>p.personId==="person-8")?.startsInWeeks,10);
  const futureMarket=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 8"});
  assert.equal(futureMarket.people.some(p=>p.personId==="person-8"),false);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET start_week_index=10 WHERE world_id=$1 AND person_id='person-5'",
   [world]));
  const futureExclusive=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 5"});
  assert.equal(futureExclusive.people.find(p=>p.personId==="person-5")?.availability,
   "FUTURE_EXCLUSIVE_ELSEWHERE");
  const free=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId},
   {view:"MARKET",search:"Wrestler 5",availability:"FREE_AGENT"});
  assert.equal(free.people.some(p=>p.personId==="person-5"),false);
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
