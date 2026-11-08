import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {decideBackstageRequest,settleBackstagePromises}
 from "../src/db/backstage-conversations.js";
import {closeUnavailableBackstageRequests}
 from "../src/db/backstage-closure.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
/** Authoritative private messages -> real authored draft -> certified match
 * and angle -> medical interruption / broken promise -> exact-once trust.
 * A different promotion's certified injury does not become an appearance
 * for the player promotion. Never uses live Neon or actual World advance.
 */
test("Phase 47 booking commitments distinguish draft, verified delivery, injured wrestler, rejection and broken word",{
 skip:!url?"Disposable PostgreSQL required":false
},async()=>{
 const id=randomUUID(),worldId="phase47-commitment-"+id,
  promotionId="cwa",otherPromotion="visitors",
  owner="booker-"+id,rival="second-manager-"+id;
 const context={worldId,promotionId,playerId:owner};
 const db=postgresPool(url!,4);
 const query=<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 const revision=async()=>Number((await query<{revision:string|number}>(
  "SELECT revision FROM ppw_worlds WHERE world_id=$1",[worldId]))[0]!.revision);
 const people=[
  ["a","Agreed Wrestler"],["b","Agreed Speaker"],
  ["c","Injured Wrestler"],["d","Forgotten Wrestler"],
  ["e","Title Challenger"],["f","Medical Contact"]
 ] as const;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Wrestler story consequences",seed:4722,
    rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"CWA",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:otherPromotion,name:"Visitors",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[owner,rival]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[worldId,owner,rival]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)"+
    " VALUES($1,$2,$3)",[worldId,owner,promotionId]);
   for(const [personId,name] of people){
    await tx.query("INSERT INTO ppw_people("+
     "world_id,person_id,name,booking_division,status)"+
     " VALUES($1,$2,$3,'MEN','ACTIVE')",[worldId,personId,name]);
    await tx.query("INSERT INTO ppw_contracts("+
     "world_id,contract_id,person_id,promotion_id,family,status,"+
     "remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+personId,personId,promotionId]);
   }
   for(const [personId,kind] of [
    ["a","MORALE"],["b","CREATIVE"],["c","MORALE"],["d","MORALE"],
    ["e","TITLE_AMBITION"],["f","MEDICAL_SUPPORT"]
   ]){
    await tx.query("INSERT INTO ppw_backstage_requests("+
     "world_id,request_id,promotion_id,person_id,kind,created_week_index)"+
     " VALUES($1,$2,$3,$4,$5,0)",
     [worldId,"request-"+personId,promotionId,personId,kind]);
   }
   // Real future card materialises only after the manager decides to book it.
   await tx.query("INSERT INTO ppw_booking_drafts("+
    "world_id,draft_id,promotion_id,year,week,status,show_name)"+
    " VALUES($1,'ascension',$2,1,2,'DRAFT','CWA Ascension'),"+
    "($1,'injury-show',$3,1,1,'DRAFT','Visitors: Fight Night')",
    [worldId,promotionId,otherPromotion]);
  });
  for(const [personId,decision] of [
   ["a","PROMISE_APPEARANCE"],["b","PROMISE_SEGMENT"],
   ["c","PROMISE_APPEARANCE"],["d","PROMISE_APPEARANCE"],
   ["e","TALK"]
  ] as const){
   const response=await decideBackstageRequest(db.pool,{...context,
    requestId:"reply-"+personId,conversationId:"request-"+personId,
    decision,expectedRevision:await revision()});
   assert.equal(response.status,"APPLIED",personId);
  }
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{
   ...context,playerId:rival,personId:"a"}),/denied/);
  const initial=await readPortablePersonaWorkspace(db.pool,{...context,personId:"a"});
  assert.equal(initial.conversations[0]?.status,"PROMISED");
  assert.equal(initial.conversations[0]?.plannedBooking,null,
   "A verbal commitment never creates a draft booking");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("INSERT INTO ppw_card_slots("+
    "world_id,draft_id,slot_id,position,kind,payload) VALUES"+
    "($1,'ascension','main',1,'MATCH',$2::jsonb),"+
    "($1,'ascension','speaking',2,'SEGMENT',$3::jsonb),"+
    "($1,'injury-show','injury-match',1,'MATCH',$4::jsonb)",
    [worldId,JSON.stringify({participants:[
     {personId:"a",contractId:"contract-a"}]}),
     JSON.stringify({participants:[{personId:"b",contractId:"contract-b"}]}),
     JSON.stringify({participants:[{personId:"c",contractId:"contract-c"}]})]);
  });
  const bookedA=(await readPortablePersonaWorkspace(db.pool,{...context,
   personId:"a"})).conversations[0]!;
  assert.deepEqual(bookedA.plannedBooking,{
   showName:"CWA Ascension",year:1,week:2,status:"DRAFT",kind:"MATCH"});
  const bookedB=(await readPortablePersonaWorkspace(db.pool,{...context,
   personId:"b"})).conversations[0]!;
  assert.equal(bookedB.plannedBooking?.kind,"SEGMENT");
  const unbooked=(await readPortablePersonaWorkspace(db.pool,{...context,
   personId:"d"})).conversations[0]!;
  assert.equal(unbooked.plannedBooking,null,
   "A different wrestler's match must not fulfil the promise");
  const title=(await readPortablePersonaWorkspace(db.pool,{...context,
   personId:"e"})).conversations[0]!;
  assert.equal(title.decision,"TALK");
  assert.equal(title.plannedBooking,null,
   "Listening to title ambitions grants no automatic championship match");
  // Two real certified records: the player show keeps A and B's promises,
  // a different promotion records C's legitimate injury after the reply.
  await withWorldTransaction(db.pool,async tx=>{
   for(const [show,promotion,week,digest] of [
    ["ascension",promotionId,2,"a".repeat(64)],
    ["injury-show",otherPromotion,1,"b".repeat(64)]
   ] as const){
    await tx.query("INSERT INTO ppw_completed_shows("+
     "world_id,promotion_id,show_id,year,week,resolution_id,"+
     "crowd_response,receipt_json,receipt_digest)"+
     " VALUES($1,$2,$3,1,$4,$5,65,'{}'::jsonb,$6)",
     [worldId,promotion,show,week,"resolution-"+show,digest]);
   }
   for(const [show,slot] of [
    ["ascension","main"],["injury-show","injury-match"]
   ] as const)
    await tx.query("INSERT INTO ppw_completed_show_matches("+
     "world_id,show_id,match_id,position,crowd_response,"+
     "actual_finish,actual_winner_side)"+
     " VALUES($1,$2,$3,1,70,'PIN','A')",[worldId,show,slot]);
   await tx.query("INSERT INTO ppw_completed_show_segments("+
    "world_id,show_id,slot_id,position,kind,authored_outcome,crowd_response)"+
    " VALUES($1,'ascension','speaking',2,'PROMO','HAPPENS',68)",
    [worldId]);
   await tx.query("INSERT INTO ppw_medical_absences("+
    "world_id,person_id,show_id,match_id,injured_week_index,"+
    "cleared_week_index,weeks_out,severity,status)"+
    " VALUES($1,'c','injury-show','injury-match',0,4,4,'MODERATE','ACTIVE')",
    [worldId]);
   await tx.query("UPDATE ppw_people SET status='INJURED'"+
    " WHERE world_id=$1 AND person_id IN ('c','f')",[worldId]);
  });
  // The system must not silently decline a request for an injured contracted
  // wrestler. They can still discuss medical support without auto-booking.
  assert.equal((await withWorldTransaction(db.pool,tx=>
   closeUnavailableBackstageRequests(tx,worldId,1))).closed,0);
  const heard=await decideBackstageRequest(db.pool,{...context,
   conversationId:"request-f",requestId:"talk-medical",
   expectedRevision:await revision(),decision:"TALK"});
  assert.equal(heard.status,"APPLIED");
  const medical=(await readPortablePersonaWorkspace(db.pool,{...context,
   personId:"f"})).conversations[0]!;
  assert.equal(medical.status,"ANSWERED");
  assert.equal(medical.decision,"TALK");
  // No future card or unverified statement can substitute for settlement.
  const settled=await withWorldTransaction(db.pool,tx=>
   settleBackstagePromises(tx,worldId,2));
  assert.equal(settled.settled,4);
  assert.equal(settled.broken,1);
  const status=await query<{person_id:string;status:string;
   assessment_reason:string|null;trust_delta:number}>(
   "SELECT person_id,status,assessment_reason,trust_delta"+
   " FROM ppw_backstage_requests WHERE world_id=$1 ORDER BY person_id",[worldId]);
  const byId=Object.fromEntries(status.map(x=>[x.person_id,x]));
  assert.equal(byId.a?.status,"FULFILLED");
  assert.equal(byId.b?.status,"FULFILLED");
  assert.equal(byId.c?.status,"EXCUSED");
  assert.equal(byId.c?.assessment_reason,"MEDICAL_UNAVAILABLE");
  assert.equal(byId.c?.trust_delta,0);
  assert.equal(byId.d?.status,"BROKEN");
  assert.equal(byId.d?.assessment_reason,"UNFULFILLED_COMMITMENT");
  assert.equal(byId.d?.trust_delta,-3);
  assert.equal(byId.e?.status,"ANSWERED");
  assert.equal(byId.f?.status,"ANSWERED");
  const trust=await query<{person_id:string;trust:number}>(
   "SELECT person_id,trust FROM ppw_backstage_promotion_trust"+
   " WHERE world_id=$1",[worldId]);
  assert.deepEqual(trust.map(x=>[x.person_id,x.trust]),[["d",47]],
   "Only the manager's truly missed commitment changes promotion trust");
  assert.equal((await withWorldTransaction(db.pool,tx=>
   settleBackstagePromises(tx,worldId,3))).settled,0,
   "No replay double-charges trust or rewrites certified consequences");
  const done=(await readPortablePersonaWorkspace(db.pool,{...context,
   personId:"a"})).conversations[0]!;
  assert.equal(done.status,"FULFILLED");
  assert.equal(done.plannedBooking,null,
   "A completed show is never offered as a still-outstanding draft");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_medical_absences","ppw_backstage_promotion_trust",
    "ppw_backstage_memories","ppw_backstage_requests",
    "ppw_completed_show_segments","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts",
    "ppw_ledger_events","ppw_command_receipts","ppw_contracts",
    "ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"
   ])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[owner,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
