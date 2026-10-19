import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {inspectPlaytestPopulation} from "../src/db/playtest-preview-readiness.js";
import {projectOriginalGenesis} from "../src/domain/original-genesis-projection.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";
import {listTalentAvailability} from "../src/db/talent-availability.js";
import {listAvailablePromotions} from "../src/db/available-promotions.js";
import {readPromotionCalendar} from "../src/db/calendar-workspace.js";
import {defaults} from "../src/domain/show-calendar.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Original Genesis projection retains real economics and rejects incompatible contracts",()=>{
 const source=originalGenesisFixture("genesis-validate");
 const projected=projectOriginalGenesis(source);
 assert.equal(projected.people.length,643);
 assert.deepEqual(projected.promotionStandings[0],{
  promotionId:"promotion-0",prestige:82,fanReputation:78,
  businessReputation:82,talentReputation:74,lastEvaluatedYear:0
 });
 assert.equal(projected.promotions.length,8);
 assert.equal(projected.contracts.length,400);
 assert.equal(projected.contracts[1]!.remaining,6);
 assert.equal(projected.contracts[0]!.remaining,null);
 assert.equal(projected.people[0]!.priorities.money,65);
 const forgedReal=originalGenesisFixture("genesis-forged-real");
 forgedReal.promotions[0]!.identity={origin:"REAL_WORLD"};
 assert.throws(()=>projectOriginalGenesis(forgedReal),/Incomplete original promotion/);
 const missingStanding=originalGenesisFixture("genesis-missing-standing");
 missingStanding.promotionStandings.pop();
 assert.throws(()=>projectOriginalGenesis(missingStanding),/Genesis population outside import bounds/);
 const invalidStanding=originalGenesisFixture("genesis-corrupt-standing");
 invalidStanding.promotionStandings[0]!.fanReputation=101;
 assert.throws(()=>projectOriginalGenesis(invalidStanding),/Invalid original promotion standing/);
 const mismatchedStanding=originalGenesisFixture("genesis-wrong-standing");
 mismatchedStanding.promotionStandings[0]!.promotionId="promotion-7";
 assert.throws(()=>projectOriginalGenesis(mismatchedStanding),/Duplicate promotion standing/);
 const missingLocal=originalGenesisFixture("genesis-missing-market");
 missingLocal.promotionMarketStates.pop();
 assert.throws(()=>projectOriginalGenesis(missingLocal),/Missing original promotion market state/);
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
 const maxSeed=originalGenesisFixture("genesis-unsigned-seed",3);
 maxSeed.world.seed=4294967295;
 assert.equal(projectOriginalGenesis(maxSeed).world.seed,4294967295);
 const corrupt=originalGenesisFixture("genesis-bad-skills",3);
 corrupt.people[0]!.skills.inRingQuality=88.5;
 assert.throws(()=>projectOriginalGenesis(corrupt),/wrestler/);
});
test("643-person authentic Genesis preserves protected promotions and real tag teams with bounded import",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const db=postgresPool(url!,3),world="original-genesis-"+randomUUID(),
  player="manager-"+randomUUID();
 const source=originalGenesisFixture(world);
 source.promotions[0]!.name="WWE";
 source.promotions[0]!.identity={origin:"REAL_WORLD"};
 source.promotions[0]!.playerTakeoverEligibility="LOCKED";
 source.promotions[1]!.name="AEW";
 source.promotions[1]!.identity={origin:"REAL_WORLD"};
 source.promotions[1]!.playerTakeoverEligibility="LOCKED";
 source.teams=[{worldId:world,id:"tag-duo",name:"The Original Duo",status:"ACTIVE"}];
 source.teamMemberships=[
  {worldId:world,teamId:"tag-duo",personId:"person-0",active:true},
  {worldId:world,teamId:"tag-duo",personId:"person-1",active:true}
 ];
 for(const person of source.people)person.portableGimmickId="HERO";
 source.personas=source.people.map(p=>({
  personId:p.id,persona:{personaName:p.name,gimmickId:"HERO",
   primaryStyle:"ALL_ROUNDER",secondaryStyle:"TECHNICAL",
   signatureMoves:[{name:"Suplex",category:"GRAPPLE",source:"PPW_AUTHORED"}],
   finishingMoves:[{name:"Flying Lariat",category:"STRIKE",source:"PPW_AUTHORED"}],
   source:"CURATED"}
 }));
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
  assert.deepEqual(result,{worldId:world,promotions:8,people:643,venues:16,contracts:400,markets:4,promotionMarketStates:32,championships:16,standings:8,personas:643,tagTeams:1,teamMembers:2,sqlStatements:13});
  const sample=meter.assertBudget({maxQueries:15,maxResultBytes:2_850});
  assert.equal(sample.queryCount,15);
  assert.equal(sample.resultRows,12);
  console.log("PPW original Genesis PostgreSQL import budget:",JSON.stringify(sample));
  const preview=await inspectPlaytestPopulation(db.pool,world);
  assert.equal(preview.ready,false,
   "The eight-promotion synthetic fixture must never be certified as real-playtest ready");
  assert.match(preview.issues.join(" "),/eight protected real promotion|promotion ecosystem/);
  assert.equal(preview.counts.wrestlers,643);
  assert.equal(preview.counts.promotions,8);
  assert.equal(preview.counts.availableTakeovers,6,
   "Protected real promotions must not appear as available player takeovers");

  const importedPersonas=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;persona:{finishingMoves:{name:string}[]}}>(`
   SELECT person_id,persona FROM ppw_portable_personas
   WHERE world_id=$1 AND person_id IN('person-0','person-1')
   ORDER BY person_id`,[world]));
  assert.equal(importedPersonas.length,2);
  assert.deepEqual(importedPersonas.map(p=>p.persona.finishingMoves[0]?.name),
   ["Flying Lariat","Flying Lariat"]);
  const restoredTeams=await withWorldTransaction(db.pool,tx=>tx.query<{
   name:string;person_id:string}>(`
   SELECT t.name,m.person_id FROM ppw_tag_teams t
    JOIN ppw_tag_team_members m ON m.world_id=t.world_id
     AND m.team_id=t.team_id AND m.active
   WHERE t.world_id=$1 ORDER BY m.person_id`,[world]));
  assert.deepEqual(restoredTeams,[
   {name:"The Original Duo",person_id:"person-0"},
   {name:"The Original Duo",person_id:"person-1"}
  ]);
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
   const titleCount=await tx.query<{count:number}>(`SELECT count(*)::integer AS count FROM ppw_championships WHERE world_id=$1`,[world]);
   const promotion=await tx.query<{management_mode:string;weekly_media_income:string;
    weekly_sponsor_income:string;weekly_fixed_overhead:string}>(`
    SELECT management_mode,weekly_media_income,weekly_sponsor_income,weekly_fixed_overhead
    FROM ppw_promotions WHERE world_id=$1 AND promotion_id='promotion-0'`,[world]);
   const imports=await tx.query<{payload:{wrestlers:number;contracts:number}}>(`
    SELECT payload FROM ppw_ledger_events WHERE world_id=$1 AND event_type='WORLD_GENESIS_IMPORTED'`,[world]);
   const standing=await tx.query<{prestige:number;fan_reputation:number;
    business_reputation:number;talent_reputation:number;last_evaluated_year:number}>(`
    SELECT prestige,fan_reputation,business_reputation,talent_reputation,last_evaluated_year
    FROM ppw_promotion_standings WHERE world_id=$1 AND promotion_id='promotion-0'`,[world]);
   return {worldRow,rows,values,contract,venue,promotion,standing,titleCount,imports};
  });
  assert.equal(Number(state.worldRow[0]!.seed),7);
  assert.equal(state.worldRow[0]!.year,1);
  assert.equal(state.worldRow[0]!.week,1);
  assert.equal(Number(state.worldRow[0]!.revision),0);
  assert.equal(state.rows[0]!.count,643);
  assert.equal(state.titleCount[0]!.count,16);
  assert.deepEqual(state.standing[0],{prestige:82,fan_reputation:78,
   business_reputation:82,talent_reputation:74,last_evaluated_year:0});
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
  const metadata=await withWorldTransaction(db.pool,tx=>tx.query<{
    enabled:boolean;markets:number;states:number}>(`
   SELECT w.show_economics_enabled AS enabled,
    (SELECT count(*)::integer FROM ppw_markets WHERE world_id=$1) AS markets,
    (SELECT count(*)::integer FROM ppw_promotion_market_states WHERE world_id=$1) AS states
   FROM ppw_worlds w WHERE w.world_id=$1`,[world]));
  assert.deepEqual(metadata[0],{enabled:true,markets:4,states:32});
  await assert.rejects(importOriginalGenesis(db.pool,source),/duplicate key/);
  await joinWorld(db.pool,{worldId:world,playerId:player,requestId:"join-"+world,expectedRevision:0});
  const claimable=await listAvailablePromotions(db.pool,world,null,25);
  assert.equal(claimable.length,6);
  assert.equal(claimable[0]?.homeMarketName,"Territory 2");
  assert.equal(claimable[0]?.rosterSize,50);
  assert.equal(claimable.some(p=>p.id==="promotion-0"),false,
   "The imported real company cannot be advertised for takeover");
  await assert.rejects(submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId:"promotion-0",requestId:"protected-"+world,expectedRevision:1}),
   /Promotion not found/);
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId:"promotion-2",requestId:"claim-"+world,expectedRevision:1});
  // WWE/AEW retain their fuller PPV schedules through the existing lazy
  // Calendar projection, with NO additional Genesis inserts or replicated rows.
  const wwe=defaults("WWE",1,13).map(s=>s.name);
  const aew=defaults("AEW",1,13).map(s=>s.name);
  for(const name of ["Monday Night Raw","Friday Night SmackDown",
   "Royal Rumble","WrestleMania","SummerSlam","Survivor Series"])
   assert.ok(wwe.includes(name),"WWE show identity missing: "+name);
  for(const name of ["AEW Dynamite","AEW Collision","Revolution",
   "Double or Nothing","All In","All Out","Full Gear","Worlds End"])
   assert.ok(aew.includes(name),"AEW show identity missing: "+name);
  const calendar=await readPromotionCalendar(db.pool,{
   worldId:world,promotionId:"promotion-2",playerId:player});
  const publicNames=calendar.worldWeeks.flatMap(w=>w.events.map(e=>e.name));
  assert.ok(publicNames.includes("Royal Rumble"));
  assert.ok(publicNames.includes("Revolution"));
  const stored=await withWorldTransaction(db.pool,tx=>tx.query<{total:number}>(`
   SELECT count(*)::integer AS total FROM ppw_show_series WHERE world_id=$1`,
   [world]));
  assert.equal(stored[0]?.total,0,
   "Untouched real series must be computed without needless Genesis writes");
  const desk=await readContractDesk(db.pool,world,player,"promotion-2");
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
    "ppw_ledger_events","ppw_command_receipts","ppw_portable_personas",
    "ppw_tag_team_members",
    "ppw_tag_teams","ppw_show_series",
    "ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_championships","ppw_people","ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"]){
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
   worlds:number;people:number;contracts:number;promotions:number;venues:number;championships:number}>(`
    SELECT (SELECT count(*)::integer FROM ppw_worlds WHERE world_id=$1) AS worlds,
     (SELECT count(*)::integer FROM ppw_people WHERE world_id=$1) AS people,
     (SELECT count(*)::integer FROM ppw_contracts WHERE world_id=$1) AS contracts,
     (SELECT count(*)::integer FROM ppw_promotions WHERE world_id=$1) AS promotions,
     (SELECT count(*)::integer FROM ppw_venues WHERE world_id=$1) AS venues,
     (SELECT count(*)::integer FROM ppw_championships WHERE world_id=$1) AS championships`,[world]));
  assert.deepEqual(counts[0],{worlds:1,people:15,contracts:15,promotions:8,venues:16,championships:16});
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_show_series","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
