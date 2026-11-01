import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {lockWorldWeek,beginWorldResolution} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import {generateWeekStaffFallbackCards} from "../src/db/generate-staff-fallback-cards.js";
import {prepareGeneratedWorldShowCommerce} from "../src/db/prepare-generated-show-commerce.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";
const url=process.env.PPW_NEON_TEST_URL;
test("AI WWE books Royal Rumble independently alongside Raw and preserves importance through commerce",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="ai-premium-"+randomUUID(),db=postgresPool(url!,4);
 const query=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,160));
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_promotions SET name='WWE' WHERE world_id=$1 AND promotion_id='promotion-0'",[world]);
   await tx.query("UPDATE ppw_worlds SET week=5,next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[world]);
  });
  assert.equal((await lockWorldWeek(db.pool,{
   worldId:world,requestId:"lock",expectedRevision:0})).status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{
   worldId:world,requestId:"continuity",expectedRevision:1})).status,"APPLIED");
  assert.equal((await finalizePreparedWorldShows(db.pool,{
   worldId:world,requestId:"finalize",expectedRevision:2})).status,"APPLIED");
  assert.equal((await beginWorldResolution(db.pool,{
   worldId:world,requestId:"begin",expectedRevision:3})).status,"APPLIED");
  const generated=await generateWeekStaffFallbackCards(db.pool,{
   worldId:world,requestId:"generate",expectedRevision:4});
  assert.equal(generated.status,"APPLIED");
  if(generated.status!=="APPLIED")throw Error("Missing generated cards");
  assert.equal(generated.result.generated.length,9);
  assert.deepEqual(generated.result.unfilled,[]);
  const booked=await query<{draft_id:string;promotion_id:string;booking_class:string;
   show_name:string|null;event_importance:number;show_day:number}>(
   "SELECT draft_id,promotion_id,booking_class,show_name,event_importance,show_day FROM ppw_booking_drafts WHERE world_id=$1 ORDER BY promotion_id,booking_class",[world]);
  assert.equal(booked.length,9);
  const wwe=booked.filter(x=>x.promotion_id==="promotion-0");
  assert.deepEqual(wwe.map(x=>[x.booking_class,x.show_name,x.event_importance]),[
   ["PREMIUM","Royal Rumble",96],["REGULAR","Monday Night Raw",76]]);
  assert.notEqual(wwe[0]!.show_day,wwe[1]!.show_day);
  const report=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,world));
  assert.equal(report.provisionalClear,true);
  assert.equal(report.activePromotions,8);
  assert.equal(report.submittedShows,9);
  const prepared=await prepareGeneratedWorldShowCommerce(db.pool,{
   worldId:world,requestId:"commerce",expectedRevision:5});
  assert.equal(prepared.status,"APPLIED");
  if(prepared.status!=="APPLIED")throw Error("Missing commerce result");
  assert.equal(prepared.result.preparedShows.length,9);
  const after=await query<{show_name:string|null;event_importance:number;
   booking_expected_demand:number}>(
   "SELECT show_name,event_importance,booking_expected_demand FROM ppw_booking_drafts WHERE world_id=$1 AND booking_class='PREMIUM'",[world]);
  assert.deepEqual(after.map(x=>[x.show_name,x.event_importance]),[["Royal Rumble",96]]);
  assert.ok(after[0]!.booking_expected_demand>=100);
  assert.equal((await generateWeekStaffFallbackCards(db.pool,{
   worldId:world,requestId:"generate",expectedRevision:4})).status,"REPLAYED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of [
    "ppw_championship_contests","ppw_programme_match_activities",
    "ppw_programme_participants","ppw_programmes",
    "ppw_championship_reigns","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_ledger_events",
    "ppw_week_staff_fallback_runs","ppw_week_prepared_finalizations",
    "ppw_week_continuity_assessments","ppw_command_receipts","ppw_card_slots",
    "ppw_booking_drafts","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_show_series","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+name+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("AI promotions nominate real title contenders on inaugural television before any champion exists",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="ai-inaugural-"+randomUUID(),db=postgresPool(url!,4);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,160));
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
   [world]));
  const before=await withWorldTransaction(db.pool,tx=>tx.query<{reigns:string}>(
   "SELECT count(*)::text AS reigns FROM ppw_championship_reigns WHERE world_id=$1",
   [world]));
  assert.equal(before[0]!.reigns,"0","An inaugural champion must come from a certified match");
  assert.equal((await lockWorldWeek(db.pool,{
   worldId:world,requestId:"lock",expectedRevision:0})).status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{
   worldId:world,requestId:"continuity",expectedRevision:1})).status,"APPLIED");
  assert.equal((await finalizePreparedWorldShows(db.pool,{
   worldId:world,requestId:"finalize",expectedRevision:2})).status,"APPLIED");
  assert.equal((await beginWorldResolution(db.pool,{
   worldId:world,requestId:"begin",expectedRevision:3})).status,"APPLIED");
  const generated=await generateWeekStaffFallbackCards(db.pool,{
   worldId:world,requestId:"generate",expectedRevision:4});
  assert.equal(generated.status,"APPLIED");
  const eligible=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;championship_id:string;finish:string;show_id:string}>([
   "SELECT d.promotion_id,s.payload->>'championshipId' AS championship_id,",
   "s.payload->>'plannedFinish' AS finish,d.draft_id AS show_id",
   "FROM ppw_card_slots s JOIN ppw_booking_drafts d",
   "ON d.world_id=s.world_id AND d.draft_id=s.draft_id",
   "WHERE s.world_id=$1 AND s.payload ? 'championshipId'",
   "ORDER BY d.promotion_id,d.draft_id,s.slot_id LIMIT 100"
  ].join(" "),[world]));
  assert.ok(eligible.length>0,"Vacant belts should have genuine AI title bouts on scheduled TV");
  assert.ok(eligible.every(c=>c.finish==="CLEAN_PIN"));
  assert.ok(eligible.every(c=>c.championship_id==="founding:singles"||
   c.championship_id==="founding:tag"));
  const stillVacant=await withWorldTransaction(db.pool,tx=>tx.query<{reigns:string}>(
   "SELECT count(*)::text AS reigns FROM ppw_championship_reigns WHERE world_id=$1",
   [world]));
  assert.equal(stillVacant[0]!.reigns,"0","AI booking does not fabricate championship reigns");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_championship_contests","ppw_programme_match_activities",
    "ppw_programme_participants","ppw_programmes",
    "ppw_championship_reigns","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_ledger_events",
    "ppw_week_staff_fallback_runs","ppw_week_prepared_finalizations",
    "ppw_week_continuity_assessments","ppw_command_receipts","ppw_card_slots",
    "ppw_booking_drafts","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_show_series","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
