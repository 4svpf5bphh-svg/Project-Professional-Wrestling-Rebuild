import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {lockWorldWeek,beginWorldResolution} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import {generateWeekStaffFallbackCards} from "../src/db/generate-staff-fallback-cards.js";
import {prepareGeneratedWorldShowCommerce} from "../src/db/prepare-generated-show-commerce.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";
import {clearWorldWeekResources} from "../src/db/week-clearance.js";
import {planNextWorldResolutionAction} from "../src/db/world-resolution-pipeline.js";

const url=process.env.PPW_NEON_TEST_URL;

/** Both named PPVs happen in World week 26, a legacy major-interval week.
 * The WWE/AEW regular cards remain independent, with separate dates, scores
 * and named match results; no second lock or hidden World hydration.
 */
test("WWE and AEW AI book Night of Champions and Forbidden Door alongside television in the same World week",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const world="ai-double-ppv-"+randomUUID(),db=postgresPool(url!,4);
 const query=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,160));
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_promotions SET name=CASE WHEN promotion_id='promotion-0' THEN 'WWE' WHEN promotion_id='promotion-1' THEN 'AEW' ELSE name END WHERE world_id=$1",[world]);
   await tx.query(`
    INSERT INTO ppw_championship_reigns
      (world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
    VALUES
      ($1,'promotion-0','founding:singles','wwe-reign','PERSON','person-0','ACTIVE',0),
      ($1,'promotion-1','founding:singles','aew-reign','PERSON','person-1','ACTIVE',0)
   `,[world]);
   await tx.query(`
    UPDATE ppw_championships
     SET current_reign_id=CASE WHEN promotion_id='promotion-0'
      THEN 'wwe-reign' ELSE 'aew-reign' END
    WHERE world_id=$1 AND promotion_id IN ('promotion-0','promotion-1')
     AND championship_id='founding:singles'
   `,[world]);
   await tx.query("UPDATE ppw_worlds SET week=26,next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[world]);
  });
  assert.equal((await lockWorldWeek(db.pool,{worldId:world,requestId:"lock",expectedRevision:0})).status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{worldId:world,requestId:"continuity",expectedRevision:1})).status,"APPLIED");
  assert.equal((await finalizePreparedWorldShows(db.pool,{worldId:world,requestId:"finalize",expectedRevision:2})).status,"APPLIED");
  assert.equal((await beginWorldResolution(db.pool,{worldId:world,requestId:"begin",expectedRevision:3})).status,"APPLIED");
  const generated=await generateWeekStaffFallbackCards(db.pool,{worldId:world,
   requestId:"generate",expectedRevision:4});
  assert.equal(generated.status,"APPLIED");
  if(generated.status!=="APPLIED")throw Error("Missing generated cards");
  assert.equal(generated.result.generated.length,10);
  assert.deepEqual(generated.result.unfilled,[]);
  const shows=await query<{draft_id:string;promotion_id:string;booking_class:string;
    show_name:string|null;show_series_id:string|null;event_importance:number;
    event_type:string;show_day:number;venue_id:string}>([
     "SELECT draft_id,promotion_id,booking_class,show_name,show_series_id,",
     "event_importance,event_type,show_day,venue_id",
     "FROM ppw_booking_drafts WHERE world_id=$1",
     "ORDER BY promotion_id,booking_class"
    ].join(" "),[world]);
  assert.equal(shows.length,10);
  for(const [promotionId,ppvName,importance] of [
    ["promotion-0","Night of Champions",89],
    ["promotion-1","Forbidden Door",90]
  ] as const){
   const mine=shows.filter(x=>x.promotion_id===promotionId);
   assert.equal(mine.length,2);
   const regular=mine.find(x=>x.booking_class==="REGULAR")!;
   const premium=mine.find(x=>x.booking_class==="PREMIUM")!;
   assert.ok(regular&&premium);
   assert.equal(regular.event_type,"REGULAR");
   assert.equal(premium.event_type,"MAJOR");
   assert.equal(premium.show_name,ppvName);
   assert.equal(premium.event_importance,importance);
   assert.match(premium.show_series_id!,/^calendar-default-ppv-/);
   assert.notEqual(regular.show_day,premium.show_day);
   const premiumMain=await query<{payload:{intent:string;mainEvent:boolean}}>(
    "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2 ORDER BY position DESC LIMIT 1",
    [world,premium.draft_id]);
   assert.equal(premiumMain[0]!.payload.mainEvent,true);
   assert.equal(premiumMain[0]!.payload.intent,"EPIC");
   const titleMatches=await query<{payload:{championshipId?:string}}>(
    "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2",
    [world,premium.draft_id]);
   assert.ok(titleMatches.some(x=>x.payload.championshipId==="founding:singles"),
    "An active championship should have an AI-booked PPV title challenge");
  }
  const states=await query<{remaining:number;cash:string}>([
   "SELECT (SELECT sum(remaining_dates)::integer FROM ppw_contracts",
   " WHERE world_id=$1 AND remaining_dates IS NOT NULL) AS remaining,",
   " (SELECT sum(cash)::text FROM ppw_promotions WHERE world_id=$1) AS cash"
   ].join(" "),[world]);
  assert.equal((await generateWeekStaffFallbackCards(db.pool,{
   worldId:world,requestId:"generate",expectedRevision:4})).status,"REPLAYED");
  assert.equal((await planNextWorldResolutionAction(db.pool,world)).action,"PREPARE_AI_AND_STAFF_COMMERCE");
  const commerce=await prepareGeneratedWorldShowCommerce(db.pool,{
   worldId:world,requestId:"commerce",expectedRevision:5});
  assert.equal(commerce.status,"APPLIED");
  if(commerce.status!=="APPLIED")throw Error("Missing commercial plans");
  assert.equal(commerce.result.preparedShows.length,10);
  const after=await query<{remaining:number;cash:string}>([
   "SELECT (SELECT sum(remaining_dates)::integer FROM ppw_contracts",
   " WHERE world_id=$1 AND remaining_dates IS NOT NULL) AS remaining,",
   " (SELECT sum(cash)::text FROM ppw_promotions WHERE world_id=$1) AS cash"
   ].join(" "),[world]);
  assert.deepEqual(after,states,"Drafting does not charge wrestlers or alter cash");
  const report=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,world));
  assert.equal(report.activePromotions,8);
  assert.equal(report.submittedShows,10);
  assert.deepEqual(report.blockers,[]);
  assert.equal((await clearWorldWeekResources(db.pool,{
   worldId:world,requestId:"clear",expectedRevision:6})).status,"APPLIED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_championship_contests","ppw_programme_match_activities",
    "ppw_programme_participants","ppw_programmes","ppw_championship_reigns",
    "ppw_championships","ppw_tag_team_members","ppw_tag_teams",
    "ppw_week_resource_clearances","ppw_ledger_events",
    "ppw_week_staff_fallback_runs","ppw_week_prepared_finalizations",
    "ppw_week_continuity_assessments","ppw_command_receipts","ppw_card_slots",
    "ppw_booking_drafts","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
