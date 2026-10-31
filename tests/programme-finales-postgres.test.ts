import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {startProgramme,chooseProgrammeFinale,readProgrammeWorkspace}
 from "../src/db/programme-workspace.js";
import {settleCompletedProgrammeHistory}
 from "../src/db/programme-resolution-history.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";

const url=process.env.PPW_NEON_TEST_URL;
test("a booked programme finale cannot close a feud until its exact angle happens in certified PostgreSQL",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),uuid=randomUUID();
 const worldId="payoff-"+uuid,promotionId="promo-"+uuid,playerId="player-"+uuid;
 const alice="alice-"+uuid,bob="bob-"+uuid;
 const scope={worldId,promotionId,playerId};
 let programmeId="";
 const receipt=(showId:string,week:number,slotId:string,
  outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED"):CompletedShowReceipt=>({
  worldId,promotionId,showId,year:1,week,
  resolutionId:"resolution-"+showId,crowdResponse:75,matches:[],
  segments:[{slotId,position:0,kind:"CONFRONTATION",
   outcome,crowdResponse:79}]
 });
 const payload=(slotId:string)=>({slotId,kind:"CONFRONTATION",
  actorIds:[alice],targetIds:[bob],outcome:"HAPPENS",
  participants:[{personId:alice,contractId:"contract-a-"+uuid},
   {personId:bob,contractId:"contract-b-"+uuid}],
  durationMinutes:5,creativeBeat:{kind:"CONFRONTATION",ending:"STAREDOWN"}});
 const prepare=async(showId:string,week:number,slotId:string)=>{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_booking_drafts("+
    "world_id,draft_id,promotion_id,year,week,status)"+
    " VALUES($1,$2,$3,1,$4,'DRAFT')",[worldId,showId,promotionId,week]);
   await tx.query("INSERT INTO ppw_card_slots("+
    "world_id,draft_id,slot_id,position,kind,payload)"+
    " VALUES($1,$2,$3,0,'SEGMENT',$4::jsonb)",
    [worldId,showId,slotId,JSON.stringify(payload(slotId))]);
   await tx.query("INSERT INTO ppw_programme_match_activities("+
    "world_id,promotion_id,programme_id,draft_id,slot_id,kind)"+
    " VALUES($1,$2,$3,$4,$5,'SEGMENT')",
    [worldId,promotionId,programmeId,showId,slotId]);
  });
 };
 const complete=async(showId:string,week:number,slotId:string,
  outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED")=>{
  const r=receipt(showId,week,slotId,outcome);
  return withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_booking_drafts SET status='SUBMITTED'"+
    " WHERE world_id=$1 AND draft_id=$2",[worldId,showId]);
   await tx.query("INSERT INTO ppw_completed_shows("+
    "world_id,promotion_id,show_id,year,week,resolution_id,"+
    "crowd_response,receipt_json,receipt_digest)"+
    " VALUES($1,$2,$3,1,$4,$5,75,$6::jsonb,$7)",
    [worldId,promotionId,showId,week,r.resolutionId,JSON.stringify(r),"f".repeat(64)]);
   return settleCompletedProgrammeHistory(tx,{
    worldId,promotionId,showId,year:1,week,eventImportance:75,
    matches:[]
   },r);
  });
 };
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Programme Payoff",seed:117,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Payoff Wrestling",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)"+
    " VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   for(const [i,person] of [alice,bob].entries()){
    await tx.query("INSERT INTO ppw_people("+
     "world_id,person_id,name,booking_division)"+
     " VALUES($1,$2,$3,'MEN')",[worldId,person,i?"Bob":"Alice"]);
    await tx.query("INSERT INTO ppw_contracts("+
     "world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+(i?"b":"a")+"-"+uuid,person,promotionId]);
   }
  });
  const started=await startProgramme(db.pool,{...scope,requestId:"start",
   expectedRevision:0,sideA:[{kind:"PERSON",refId:alice}],
   sideB:[{kind:"PERSON",refId:bob}]});
  assert.equal(started.status,"APPLIED");
  if(started.status!=="APPLIED")throw Error("No programme");
  programmeId=started.result.programmeId;
  await prepare("week1",1,"staredown");
  await assert.rejects(chooseProgrammeFinale(db.pool,{...scope,programmeId,
   requestId:"wrong",expectedRevision:1,
   showId:"week1",slotId:"missing",payoff:"FINAL_CONFRONTATION"}),
   /Book this match or angle/);
  await assert.rejects(chooseProgrammeFinale(db.pool,{...scope,programmeId,
   playerId:"other",requestId:"intruder",expectedRevision:1,
   showId:"week1",slotId:"staredown",payoff:"FINAL_CONFRONTATION"}),
   /accessible|denied|owned/i);
  const planned=await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   requestId:"plan-1",expectedRevision:1,
   showId:"week1",slotId:"staredown",payoff:"FINAL_CONFRONTATION"});
  assert.equal(planned.status,"APPLIED");
  assert.equal((await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   requestId:"plan-1",expectedRevision:1,
   showId:"week1",slotId:"staredown",payoff:"FINAL_CONFRONTATION"})).status,"REPLAYED");
  let view=await readProgrammeWorkspace(db.pool,scope);
  let current=view.programmes.find(x=>x.programmeId===programmeId)!;
  assert.equal(current.status,"ACTIVE");
  assert.equal(current.finale?.payoff,"FINAL_CONFRONTATION");
  assert.equal(current.finale?.resolvedWeekIndex,null);
  assert.equal(current.plannedActivity[0]?.segmentKind,"CONFRONTATION");
  // A scripted non-event cannot count as a finale or manufacture a history chapter.
  assert.deepEqual(await complete("week1",1,"staredown","INTERRUPTED"),
   {recorded:0,programmes:0});
  view=await readProgrammeWorkspace(db.pool,scope);
  current=view.programmes.find(x=>x.programmeId===programmeId)!;
  assert.equal(current.status,"ACTIVE");
  assert.equal(current.finale?.resolvedWeekIndex,null);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[worldId]));
  await prepare("week2",2,"final-faceoff");
  const replanned=await chooseProgrammeFinale(db.pool,{...scope,programmeId,
   requestId:"plan-2",expectedRevision:2,
   showId:"week2",slotId:"final-faceoff",payoff:"FINAL_CONFRONTATION"});
  assert.equal(replanned.status,"APPLIED");
  const resolved=await complete("week2",2,"final-faceoff","HAPPENS");
  assert.deepEqual(resolved,{recorded:1,programmes:1});
  view=await readProgrammeWorkspace(db.pool,scope);
  current=view.programmes.find(x=>x.programmeId===programmeId)!;
  assert.equal(current.status,"COMPLETED");
  assert.equal(current.endedWeekIndex,1);
  assert.equal(current.finale?.resolvedWeekIndex,1);
  assert.equal(current.finale?.resolvedCrowdResponse,79);
  assert.equal(current.segmentCount,1);
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>tx.query(
    "SELECT event_type FROM ppw_ledger_events WHERE world_id=$1"+
    " AND event_type='PROGRAMME_FINALE_DELIVERED'",[worldId])),
   [{event_type:"PROGRAMME_FINALE_DELIVERED"}]);
  // Duplicate show settlement cannot publish a second payoff.
  assert.deepEqual(await withWorldTransaction(db.pool,tx=>
   settleCompletedProgrammeHistory(tx,{
    worldId,promotionId,showId:"week2",year:1,week:2,
    eventImportance:75,matches:[]
   },receipt("week2",2,"final-faceoff","HAPPENS"))),
   {recorded:0,programmes:0});
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_programme_finales","ppw_programme_postshow_directions",
    "ppw_programme_resolved_activities","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows",
    "ppw_programme_match_activities","ppw_card_slots","ppw_booking_drafts",
    "ppw_ledger_events","ppw_command_receipts","ppw_programme_creative_agreements",
    "ppw_programme_side_refs","ppw_programme_participants","ppw_programmes",
    "ppw_contracts","ppw_people","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  });
  await db.pool.end();
 }
});
