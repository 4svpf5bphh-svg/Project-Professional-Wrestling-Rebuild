/** Parent-company contracts remain owned and charged by the signing company.
 * This is a disposable PostgreSQL exercise, never a live World change.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {readWrestlerDirectory} from "../src/db/wrestler-directory.js";
import {cardTalentAsActor,saveCardEditorAsActor,markPreparedShowReadyAsActor}
 from "../src/api/world-service.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";
import {consumeShowAppearances} from "../src/db/appearance-consumption.js";

const url=process.env.PPW_NEON_TEST_URL;
test("parent-owned contracts are visibly bookable for named affiliates and consume original dates",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3);
 const world="parent-roster-"+randomUUID(),player="booker-"+randomUUID();
 const parent="promotion-0",child="promotion-3",show="child-show";
 const source=originalGenesisFixture(world,64);
 source.promotions[3]!.identity={origin:"FICTIONAL",parentPromotionId:parent};
 source.contracts=source.contracts.filter(c=>c.promotionId!==child);
 source.wrestlerPromotionAffiliations=[
  {worldId:world,personId:"person-0",promotionId:child,
   role:"PRIMARY",basis:"PARENT_COMPANY"},
  {worldId:world,personId:"person-24",promotionId:child,
   role:"PRIMARY",basis:"PARENT_COMPANY"}
 ];
 const context={pool:db.pool,actor:{playerId:player}};
 const scope={worldId:world,promotionId:child,showId:show};
 const first={personId:"person-0",contractId:"contract-0"};
 const second={personId:"person-24",contractId:"contract-24"};
 const unauthorized={personId:"person-48",contractId:"contract-48"};
 const match=(opponent:typeof second)=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  participants:[first,opponent],
  sides:[{sideId:"A",participants:[first]},{sideId:"B",participants:[opponent]}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18
 });
 try{
  await importOriginalGenesis(db.pool,source);
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [world,player,child]);
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
     status,show_day,venue_id,market_id,ticket_strategy,booking_class,event_type,event_importance)
    VALUES($1,$2,$3,1,1,'DRAFT',3,'venue-0','market-0','STANDARD','REGULAR','REGULAR',60)`,
    [world,show,child]);
  });
  const picker=await cardTalentAsActor(context,world,child,show,"Wrestler");
  assert.deepEqual(picker.talent.map(p=>p.personId).sort(),["person-0","person-24"]);
  assert.ok(picker.talent.every(p=>p.available&&p.division==="WOMEN"));
  assert.ok(picker.talent.every(p=>p.contractId.startsWith("contract-")));
  const roster=await readWrestlerDirectory(db.pool,
   {worldId:world,playerId:player,promotionId:child},{view:"ROSTER",limit:40});
  assert.deepEqual(roster.people.map(p=>p.personId).sort(),["person-0","person-24"]);
  assert.ok(roster.people.every(p=>p.availability==="YOUR_ROSTER"));
  assert.equal(source.contracts.filter(c=>c.promotionId===child).length,8,
   "Child's directly signed contracts remain separate from explicit affiliate rights");
  const bad=()=>saveCardEditorAsActor(context,{...scope,requestId:"forged",
   expectedRevision:0,matches:[{slotId:"main",payload:match(unauthorized)}],
   segments:[],runningOrder:["main"]});
  await assert.rejects(bad(),/contract rights/,
   "A different parent-contracted wrestler is forbidden without an affiliation");
  const saved=await saveCardEditorAsActor(context,{...scope,requestId:"valid",
   expectedRevision:0,matches:[{slotId:"main",payload:match(second)}],
   segments:[],runningOrder:["main"]});
  assert.equal(saved.status,"APPLIED");
  const ready=await markPreparedShowReadyAsActor(context,{...scope,
   requestId:"ready",expectedRevision:1,confirmReadyToRun:true});
  assert.equal(ready.status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_booking_drafts SET status='SUBMITTED' WHERE world_id=$1 AND draft_id=$2",
    [world,show]);
   await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[world]);
  });
  const conflict=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,world));
  assert.equal(conflict.blockers.some(b=>b.code==="CONTRACT_UNAVAILABLE"),false,
   "The arbitration stage must recognise the same parent-affiliate contract rights");
  // Only the receipt prerequisite is supplied by this focused settlement test.
  // The authentic 13-promotion pipeline test performs actual World clearance.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_week_resource_clearances(world_id,year,week,eligible_promotions,
    inspected_slots,command_request_id) VALUES($1,1,1,8,1,'isolated-parent-test')`,[world]));
  const outcome=await consumeShowAppearances(db.pool,{...scope,playerId:"system",
   requestId:"charge-parent-contracts",expectedRevision:2});
  assert.equal(outcome.status,"APPLIED");
  assert.equal(outcome.result.datesCharged,1,
   "Only the finite original parent contract loses an appearance");
  const balance=await withWorldTransaction(db.pool,tx=>tx.query<{
   contract_id:string;remaining_dates:number|null;promotion_id:string}>(`
   SELECT contract_id,remaining_dates,promotion_id FROM ppw_contracts
   WHERE world_id=$1 AND contract_id IN('contract-0','contract-24','contract-48')
   ORDER BY contract_id`,[world]));
  assert.deepEqual(balance,[
   {contract_id:"contract-0",remaining_dates:null,promotion_id:parent},
   {contract_id:"contract-24",remaining_dates:6,promotion_id:parent},
   {contract_id:"contract-48",remaining_dates:7,promotion_id:parent}
  ]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_show_resolutions","ppw_week_resource_clearances","ppw_command_receipts",
    "ppw_card_slots","ppw_booking_drafts","ppw_ledger_events",
    "ppw_promotion_controls","ppw_memberships",
    "ppw_wrestler_promotion_affiliations","ppw_portable_personas",
    "ppw_tag_team_members","ppw_tag_teams",
    "ppw_contracts","ppw_championships","ppw_promotion_standings","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
