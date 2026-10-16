import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {projectOriginalGenesis} from "../src/domain/original-genesis-projection.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
import {listTalentAvailability} from "../src/db/talent-availability.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Original Genesis projection retains real economics and rejects incompatible contracts",()=>{
 const source=originalGenesisFixture("genesis-validate");
 const projected=projectOriginalGenesis(source);
 assert.equal(projected.people.length,643);
 assert.equal(projected.promotions.length,8);
 assert.equal(projected.contracts.length,400);
 assert.equal(projected.contracts[1]!.remaining,6);
 assert.equal(projected.contracts[0]!.remaining,null);
 assert.equal(projected.people[0]!.priorities.money,65);
 const duplicate=originalGenesisFixture("genesis-duplicate");
 duplicate.people[1]!.id=duplicate.people[0]!.id;
 assert.throws(()=>projectOriginalGenesis(duplicate),/Duplicate wrestler/);
 const conflict=originalGenesisFixture("genesis-conflict",20);
 const overlap={...conflict.contracts[0]!,id:"another-contract",family:"LIMITED_NON_EXCLUSIVE" as const,
  exclusivity:"NON_EXCLUSIVE" as const,appearanceFee:5000};
 conflict.contracts.push(overlap);
 assert.throws(()=>projectOriginalGenesis(conflict),/Conflicting global exclusive/);
 const past=originalGenesisFixture("genesis-old");
 past.world.currentDate.week=8;
 assert.throws(()=>projectOriginalGenesis(past),/fresh 52-week/);
 const corrupt=originalGenesisFixture("genesis-bad-skills",3);
 corrupt.people[0]!.skills.inRingQuality=88.5;
 assert.throws(()=>projectOriginalGenesis(corrupt),/wrestler/);
});
test("Original 643-person/8-promotion Genesis imports once with <=8 PostgreSQL statements",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3),world="original-genesis-"+randomUUID(),
  player="manager-"+randomUUID();
 const source=originalGenesisFixture(world);
 try{
  const meter=new MeasuredQuerySession("original-genesis-one-time-bootstrap");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const result=await importOriginalGenesis(measured,source);
  assert.deepEqual(result,{worldId:world,promotions:8,people:643,venues:16,contracts:400,sqlStatements:6});
  const sample=meter.assertBudget({maxQueries:8,maxResultBytes:2_000});
  assert.equal(sample.queryCount,8);
  assert.equal(sample.resultRows,5);
  console.log("PPW original Genesis PostgreSQL import budget:",JSON.stringify(sample));
  const state=await withWorldTransaction(db.pool,async tx=>{
   const worldRow=await tx.query<{seed:string;offer_acceptance_threshold:number;
    injury_rate_multiplier:string;year:number;week:number;revision:string}>(`
    SELECT seed,offer_acceptance_threshold,injury_rate_multiplier,year,week,revision
    FROM ppw_worlds WHERE world_id=$1`,[world]);
   const rows=await tx.query<{count:number}>(`
    SELECT count(*)::integer AS count FROM ppw_people WHERE world_id=$1`,[world]);
   const values=await tx.query<{name:string;career_stage:string;booking_division:string;
    in_ring_quality:number;contract_priorities:{money:number}}>(`
    SELECT name,career_stage,booking_division,in_ring_quality,contract_priorities
    FROM ppw_people WHERE world_id=$1 AND person_id='person-1'`,[world]);
   const contract=await tx.query<{family:string;status:string;remaining_dates:number|null;
    date_entitlement:number;weekly_guarantee:string;appearance_fee:string;creative_control:string}>(`
    SELECT family,status,remaining_dates,date_entitlement,
    weekly_guarantee,appearance_fee,creative_control FROM ppw_contracts
    WHERE world_id=$1 AND contract_id='contract-1'`,[world]);
   const venue=await tx.query<{capacity:number;weekly_hire_cost:string}>(`
    SELECT capacity,weekly_hire_cost FROM ppw_venues
    WHERE world_id=$1 AND venue_id='venue-0'`,[world]);
   const promotion=await tx.query<{management_mode:string;weekly_media_income:string;
    weekly_sponsor_income:string;weekly_fixed_overhead:string}>(`
    SELECT management_mode,weekly_media_income,weekly_sponsor_income,weekly_fixed_overhead
    FROM ppw_promotions WHERE world_id=$1 AND promotion_id='promotion-0'`,[world]);
   const imports=await tx.query<{payload:{wrestlers:number;contracts:number}}>(`
    SELECT payload FROM ppw_ledger_events WHERE world_id=$1 AND event_type='WORLD_GENESIS_IMPORTED'`,[world]);
   return {worldRow,rows,values,contract,venue,promotion,imports};
  });
  assert.equal(Number(state.worldRow[0]!.seed),7);
  assert.equal(state.worldRow[0]!.year,1);
  assert.equal(state.worldRow[0]!.week,1);
  assert.equal(Number(state.worldRow[0]!.revision),0);
  assert.equal(state.rows[0]!.count,643);
  assert.equal(state.values[0]!.career_stage,"PRIME");
  assert.equal(state.values[0]!.in_ring_quality,61);
  assert.equal(state.values[0]!.contract_priorities.money,65);
  assert.equal(state.contract[0]!.remaining_dates,6);
  assert.equal(state.contract[0]!.date_entitlement,7);
  assert.equal(Number(state.contract[0]!.weekly_guarantee),3000);
  assert.equal(state.contract[0]!.creative_control,"CONSULTATION");
  assert.equal(state.venue[0]!.capacity,1500);
  assert.equal(Number(state.venue[0]!.weekly_hire_cost),25000);
  assert.equal(state.promotion[0]!.management_mode,"AI");
  assert.equal(Number(state.promotion[0]!.weekly_media_income),300000);
  assert.equal(state.imports[0]!.payload.wrestlers,643);
  await assert.rejects(importOriginalGenesis(db.pool,source),/duplicate key/);
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join-"+world,expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId:"promotion-0",requestId:"claim-"+world,expectedRevision:1});
  const desk=await readContractDesk(db.pool,world,player,"promotion-0");
  assert.equal(desk.summary.signed,50);
  assert.equal(desk.summary.pendingOffers,0);
  assert.ok(desk.roster.every(c=>c.weeklyGuarantee>0));
  assert.ok(desk.roster.some(c=>c.family==="EXCLUSIVE"&&c.remainingDates===null));
  const market=await listTalentAvailability(db.pool,world,null,null,25);
  assert.equal(market.length,25);
  assert.ok(market.some(c=>c.signedContracts===1));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of ["ppw_contract_offers","ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_people","ppw_venues","ppw_promotions"]){
    await tx.query(`DELETE FROM ${name} WHERE world_id=$1`,[world]);
   }
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
test("Concurrent bootstraps cannot create duplicate or partial Genesis Worlds",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3),world="genesis-race-"+randomUUID();
 try{
  const source=originalGenesisFixture(world,15);
  const attempts=await Promise.allSettled([
   importOriginalGenesis(db.pool,source),importOriginalGenesis(db.pool,source),
  ]);
  assert.equal(attempts.filter(a=>a.status==="fulfilled").length,1);
  assert.equal(attempts.filter(a=>a.status==="rejected").length,1);
  const counts=await withWorldTransaction(db.pool,async tx=>tx.query<{
   worlds:number;people:number;contracts:number;promotions:number;venues:number}>(`
    SELECT (SELECT count(*)::integer FROM ppw_worlds WHERE world_id=$1) AS worlds,
     (SELECT count(*)::integer FROM ppw_people WHERE world_id=$1) AS people,
     (SELECT count(*)::integer FROM ppw_contracts WHERE world_id=$1) AS contracts,
     (SELECT count(*)::integer FROM ppw_promotions WHERE world_id=$1) AS promotions,
     (SELECT count(*)::integer FROM ppw_venues WHERE world_id=$1) AS venues`,[world]));
  assert.deepEqual(counts[0],{worlds:1,people:15,contracts:15,promotions:8,venues:16});
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_contracts","ppw_people","ppw_venues","ppw_promotions"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
