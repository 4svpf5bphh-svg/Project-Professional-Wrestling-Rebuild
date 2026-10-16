import assert from "node:assert/strict";
import test from "node:test";
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
import {planNextWorldResolutionAction} from "../src/db/world-resolution-pipeline.js";
import {originalAiTicketStrategy} from "../src/domain/legacy-show-economics.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Eight AI promotions generate roster-backed original-market shows and frozen commercial forecasts in one World stage",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const world="ai-week-"+randomUUID(),db=postgresPool(url!,4);
 try{
  const source=originalGenesisFixture(world,120);
  await importOriginalGenesis(db.pool,source);
  // Canonical rival programme and a world-owned tag identity. The AI may
  // use the rivalry as a singles main; tag members must not be invented
  // as a four-person match before the result simulator supports tags.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_programmes
    (world_id,promotion_id,programme_id,status,heat,repetition)
    VALUES($1,'promotion-0','feud-1','ACTIVE',96,0)`,[world]);
   await tx.query(`INSERT INTO ppw_programme_participants
    (world_id,promotion_id,programme_id,person_id,side)
    VALUES($1,'promotion-0','feud-1','person-8','A'),
          ($1,'promotion-0','feud-1','person-16','B')`,[world]);
   await tx.query(`INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    VALUES($1,'tag-partners','The Partners','ACTIVE')`,[world]);
   await tx.query(`INSERT INTO ppw_tag_team_members(world_id,team_id,person_id)
    VALUES($1,'tag-partners','person-0'),($1,'tag-partners','person-24')`,[world]);
   await tx.query(`INSERT INTO ppw_tag_teams(world_id,team_id,name,status)
    VALUES($1,'tag-next','The Next','ACTIVE')`,[world]);
   await tx.query(`INSERT INTO ppw_tag_team_members(world_id,team_id,person_id)
    VALUES($1,'tag-next','person-48'),($1,'tag-next','person-72')`,[world]);
   await tx.query(`INSERT INTO ppw_championships
    (world_id,promotion_id,championship_id,name,division,status,prestige,current_reign_id)
    VALUES($1,'promotion-0','singles-title','World Championship','SINGLES','ACTIVE',95,'reign-1')`,[world]);
   await tx.query(`INSERT INTO ppw_championship_reigns
    (world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
    VALUES($1,'promotion-0','singles-title','reign-1','PERSON','person-8','ACTIVE',0)`,[world]);
  });
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[world]));
  assert.equal((await lockWorldWeek(db.pool,{worldId:world,requestId:"lock",expectedRevision:0})).status,"APPLIED");
  const assessed=await recordWeekContinuity(db.pool,{worldId:world,requestId:"continuity",expectedRevision:1});
  assert.equal(assessed.status,"APPLIED");
  if(assessed.status!=="APPLIED")throw Error("Missing assessment");
  assert.equal(assessed.result.counts.AI_MANAGED,8);
  assert.equal((await finalizePreparedWorldShows(db.pool,{worldId:world,
   requestId:"finalize",expectedRevision:2})).status,"APPLIED");
  assert.equal((await beginWorldResolution(db.pool,{worldId:world,
   requestId:"begin",expectedRevision:3})).status,"APPLIED");
  assert.equal((await planNextWorldResolutionAction(db.pool,world)).action,"GENERATE_STAFF_AND_AI_CARDS");
  const generated=await generateWeekStaffFallbackCards(db.pool,{worldId:world,
   requestId:"generate",expectedRevision:4});
  assert.equal(generated.status,"APPLIED");
  if(generated.status!=="APPLIED")throw Error("Missing AI generation");
  assert.equal(generated.result.generated.length,8);
  assert.deepEqual(generated.result.unfilled,[]);
  assert.ok(generated.result.generated.every(x=>x.origin==="AI"));
  const cardRows=await withWorldTransaction(db.pool,tx=>tx.query<{
    draft_id:string;slot_id:string;position:number;payload:{
      participants:{personId:string;contractId:string}[];
      scriptedWinner:string;intent:string;plannedFinish:string;
      matchType?:"SINGLES"|"TAG";family?:string;scriptedWinnerSide?:string;
      sides?:{sideId:string;participants:{personId:string;contractId:string}[]}[];
      plannedLengthMinutes:number;mainEvent:boolean;scriptedBy:string;
    }}>(`
    SELECT draft_id,slot_id,position,payload FROM ppw_card_slots
    WHERE world_id=$1 ORDER BY draft_id,position`,[world]));
  const byCard=new Map<string,Array<(typeof cardRows)[number]>>();
  for(const row of cardRows){
    const group=byCard.get(row.draft_id)??[];
    group.push(row);byCard.set(row.draft_id,group);
  }
  assert.equal(byCard.size,8);
  const tagMatches=(byCard.get("ai-week-1-1-promotion-0")??[])
   .filter(x=>x.payload.matchType==="TAG");
  assert.equal(tagMatches.length,1,"AI must use two available established tag teams");
  assert.deepEqual(tagMatches[0]!.payload.sides?.map(side=>
   side.participants.map(p=>p.personId).sort())
    .sort((a,b)=>a.join(":").localeCompare(b.join(":"))),[
    ["person-0","person-24"],["person-48","person-72"]]);
  const mainProgramme=byCard.get("ai-week-1-1-promotion-0")?.at(-1);
  assert.equal(mainProgramme?.payload.mainEvent,true);
  assert.deepEqual(mainProgramme?.payload.participants.map(p=>p.personId).sort(),
    ["person-16","person-8"]);
  const links=await withWorldTransaction(db.pool,tx=>tx.query<{
    programme_id:string;slot_id:string}>(`
    SELECT programme_id,slot_id FROM ppw_programme_match_activities
     WHERE world_id=$1`,[world]));
  assert.deepEqual(links,[{programme_id:"feud-1",slot_id:mainProgramme!.slot_id}]);
  for(const slots of byCard.values()){
    assert.ok(slots.length>=2&&slots.length<=5);
    assert.deepEqual(slots.map(x=>x.position),slots.map((_,i)=>i));
    assert.equal(slots.at(-1)!.payload.mainEvent,true);
    assert.ok(slots.slice(0,-1).every(x=>!x.payload.mainEvent));
    const ids=slots.flatMap(s=>s.payload.participants.map(p=>p.personId));
    assert.ok(ids.length>=slots.length*2);
    assert.equal(ids.length,slots.reduce((sum,slot)=>sum+
      slot.payload.participants.length,0));
    assert.equal(new Set(ids).size,ids.length);
    assert.ok(ids.length<=10);
    for(const slot of slots){
      assert.equal(slot.payload.scriptedBy,"AI_WORLD_BOOKER");
      assert.ok(slot.payload.participants.some(x=>x.personId===slot.payload.scriptedWinner));
      if(slot.payload.matchType==="TAG"){
       assert.equal(slot.payload.family,"TEAMS");
       assert.equal(slot.payload.participants.length,4);
       assert.deepEqual(slot.payload.sides?.map(x=>x.participants.length),[2,2]);
       assert.ok(["A","B"].includes(slot.payload.scriptedWinnerSide!));
      }else assert.equal(slot.payload.participants.length,2);
      assert.ok(slot.payload.intent);
      assert.ok(slot.payload.plannedFinish);
      assert.ok(slot.payload.plannedLengthMinutes>=3);
    }
  }
  assert.equal((await generateWeekStaffFallbackCards(db.pool,{worldId:world,
   requestId:"generate",expectedRevision:4})).status,"REPLAYED");
  const before=await withWorldTransaction(db.pool,tx=>tx.query<{
   date_count:number;cash_total:string}>(`
    SELECT (SELECT sum(remaining_dates)::integer FROM ppw_contracts
      WHERE world_id=$1) AS date_count,
     (SELECT sum(cash)::text FROM ppw_promotions WHERE world_id=$1) AS cash_total`,
   [world]));
  assert.equal((await planNextWorldResolutionAction(db.pool,world)).action,"PREPARE_AI_AND_STAFF_COMMERCE");
  const prepared=await prepareGeneratedWorldShowCommerce(db.pool,{
   worldId:world,requestId:"commerce",expectedRevision:5});
  assert.equal(prepared.status,"APPLIED");
  if(prepared.status!=="APPLIED")throw Error("Commercial stage failed");
  assert.equal(prepared.result.preparedShows.length,8);
  assert.equal((await prepareGeneratedWorldShowCommerce(db.pool,{
   worldId:world,requestId:"commerce",expectedRevision:5})).status,"REPLAYED");
  await assert.rejects(prepareGeneratedWorldShowCommerce(db.pool,{
   worldId:world,requestId:"second",expectedRevision:6}),/No AI\/staff shows needed/);
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
   draft_id:string;booking_origin:string;market_id:string;venue_market_id:string;
   ticket_strategy:"ACCESSIBLE"|"STANDARD"|"PREMIUM"|"PRESTIGE";
   tier:"GLOBAL"|"NATIONAL"|"RISING"|"INDEPENDENT";
   event_type:"REGULAR"|"MAJOR";ai_financial_caution:number;
   booking_expected_demand:number;booking_ticket_yield:string;
   booking_snapshot_fingerprint:string;event_importance:number;
  }>(`
    SELECT d.draft_id,d.booking_origin,d.market_id,v.market_id AS venue_market_id,
      d.ticket_strategy,p.tier,d.event_type,p.ai_financial_caution,
      d.booking_expected_demand,d.booking_ticket_yield::text,
      d.booking_snapshot_fingerprint,d.event_importance
    FROM ppw_booking_drafts d
    JOIN ppw_venues v ON v.world_id=d.world_id AND v.venue_id=d.venue_id
    JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
    WHERE d.world_id=$1 ORDER BY d.promotion_id`,[world]));
  assert.equal(rows.length,8);
  for(const row of rows){
   assert.equal(row.booking_origin,"AI");
   assert.equal(row.market_id,row.venue_market_id);
   assert.equal(row.event_type,"REGULAR");
   assert.equal(row.event_importance,58);
   assert.equal(row.ticket_strategy,originalAiTicketStrategy(row.tier,
    row.event_type,row.ai_financial_caution));
   assert.ok(row.booking_expected_demand>=100);
   assert.ok(Number(row.booking_ticket_yield)>0);
   assert.match(row.booking_snapshot_fingerprint,/^[a-f0-9]{64}$/);
  }
  const after=await withWorldTransaction(db.pool,tx=>tx.query<{
   date_count:number;cash_total:string}>(`
    SELECT (SELECT sum(remaining_dates)::integer FROM ppw_contracts
      WHERE world_id=$1) AS date_count,
     (SELECT sum(cash)::text FROM ppw_promotions WHERE world_id=$1) AS cash_total`,
   [world]));
  assert.deepEqual(after,before,"Booking spends neither contract dates nor cash");
  assert.equal((await planNextWorldResolutionAction(db.pool,world)).action,"CLEAR_RESOURCES");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const name of [
    "ppw_championship_contests","ppw_programme_match_activities",
    "ppw_programme_participants","ppw_programmes",
    "ppw_championship_reigns","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams",
    "ppw_ledger_events","ppw_week_staff_fallback_runs",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_command_receipts","ppw_card_slots","ppw_booking_drafts",
    "ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query(`DELETE FROM ${name} WHERE world_id=$1`,[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
