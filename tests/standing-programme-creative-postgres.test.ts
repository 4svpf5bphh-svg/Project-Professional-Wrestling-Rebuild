import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import type {TransactionPool} from "../src/db/transaction.js";
import {standingCreativeAgreementAsActor,showCardEditorAsActor,
 saveCardEditorAsActor,markPreparedShowReadyAsActor,programmeWorkspaceAsActor}
 from "../src/api/world-service.js";
const url=process.env.PPW_NEON_TEST_URL;
test("standing rivalry agreement covers only approved participants, term and finish",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),key=randomUUID(),world="standing-"+key;
 const player="owner-"+key,other="other-"+key,promotion="local",show="weekly";
 const ctx={pool:db.pool,actor:{playerId:player}};
 const ids={worldId:world,promotionId:promotion,showId:show};
 const alice={personId:"alice",contractId:"deal-alice"};
 const bob={personId:"bob",contractId:"deal-bob"};
 const match=(winner="A",finish="CLEAN_PIN")=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[bob]}],
  participants:[alice,bob],scriptedWinnerSide:winner,
  plannedFinish:finish,intent:"COMPETITIVE",plannedLengthMinutes:18
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Rivalry agreement trial",seed:13,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Local",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,other]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[world,player,other]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id,status) VALUES($1,'hall','Hall','home','ACTIVE')",[world]);
   for(const who of ["alice","bob"]){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,fatigue,contract_priorities) VALUES($1,$2,$2,'MEN',90,4,$3::jsonb)",
     [world,who,JSON.stringify({money:40,role:30,prestige:40,schedule:40,loyalty:90,exposure:40})]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index,creative_control,role_expectation) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52,$5,'FEATURED')",
     [world,"deal-"+who,who,promotion,who==="alice"?"FULL_APPROVAL":"NONE"]);
   }
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition,started_week_index) VALUES($1,$2,'rivalry','ACTIVE',60,2,0)",[world,promotion]);
   await tx.query("INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id) VALUES($1,$2,'rivalry','A',0,'PERSON','alice'),($1,$2,'rivalry','B',0,'PERSON','bob')",[world,promotion]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id) VALUES($1,$2,'local',1,1,'DRAFT',3,'hall','home')",[world,show]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'bout',0,'MATCH',$3::jsonb)",[world,show,JSON.stringify(match())]);
   await tx.query("INSERT INTO ppw_programme_match_activities(world_id,promotion_id,programme_id,draft_id,slot_id,kind) VALUES($1,$2,'rivalry',$3,'bout','MATCH')",[world,promotion,show]);
  });
  const before=await showCardEditorAsActor(ctx,world,promotion,show);
  assert.equal(before.creativeConcerns[0]?.decision,"NOT_REQUESTED");
  const terms={worldId:world,promotionId:promotion,programmeId:"rivalry",
   personId:"alice",requestId:"agreement",expectedRevision:0,
   matchType:"SINGLES" as const,permittedOutcome:"WIN_ONLY" as const,termWeeks:3};
  await assert.rejects(standingCreativeAgreementAsActor({pool:db.pool,
   actor:{playerId:other}},terms),/not available|not accessible/);
  const accepted=await standingCreativeAgreementAsActor(ctx,terms);
  assert.equal(accepted.status,"APPLIED");
  if(accepted.status==="APPLIED")assert.equal(accepted.result.approved,true);
  assert.equal((await standingCreativeAgreementAsActor(ctx,terms)).status,"REPLAYED");
  // An active signed rivalry must cost the same as an ordinary Programme
  // overview: one roster scan and one combined activity/terms projection.
  const meter=new MeasuredQuerySession("rivalry-desk-with-standing-terms");
  const measured:TransactionPool={async connect(){
   const connection=await db.pool.connect();
   return {release(){connection.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]=[]){
     return meter.execute(()=>connection.query<T>(sql,args));
    }};
  }};
  const programme=await programmeWorkspaceAsActor({pool:measured,
   actor:{playerId:player}},world,promotion);
  assert.equal(programme.programmes[0]?.eligibleCreativePeople[0]?.personId,"alice");
  assert.equal(programme.programmes[0]?.creativeAgreements[0]?.approved,true);
  const usage=meter.assertBudget({maxQueries:7,maxResultBytes:80_000});
  console.log("PPW standing rivalry desk budget:",JSON.stringify(usage));
  const covered=await showCardEditorAsActor(ctx,world,promotion,show);
  assert.equal(covered.creativeConcerns[0]?.decision,"APPROVED");
  assert.equal(covered.creativeConcerns[0]?.approvalSource,"STANDING_PROGRAMME");
  assert.equal((await markPreparedShowReadyAsActor(ctx,{...ids,requestId:"ready",
   expectedRevision:1,confirmReadyToRun:true})).status,"APPLIED");
  const changed=await saveCardEditorAsActor(ctx,{...ids,requestId:"rebook",
   expectedRevision:2,matches:[{slotId:"bout",payload:match("B")}],
   segments:[],runningOrder:["bout"]});
  assert.equal(changed.status,"APPLIED");
  const blocked=await showCardEditorAsActor(ctx,world,promotion,show);
  assert.equal(blocked.creativeConcerns[0]?.decision,"NOT_REQUESTED");
  await assert.rejects(markPreparedShowReadyAsActor(ctx,{...ids,
   requestId:"blocked",expectedRevision:3,confirmReadyToRun:true}),/creative agreement/);
  // Rejected long-term terms are a durable wrestler decision, not a button
  // a connected player can press repeatedly for a better answer.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_contracts SET creative_control='FULL_APPROVAL' WHERE world_id=$1 AND person_id='bob'",[world]);
   await tx.query("UPDATE ppw_people SET morale=1,fatigue=95,contract_priorities=$2::jsonb WHERE world_id=$1 AND person_id='bob'",
    [world,JSON.stringify({money:40,role:95,prestige:40,schedule:40,loyalty:0,exposure:40})]);
  });
  const refusalTerms={...terms,personId:"bob",requestId:"bob-refuses",
   expectedRevision:3,permittedOutcome:"WIN_OR_PROTECTED_LOSS" as const};
  const refusal=await standingCreativeAgreementAsActor(ctx,refusalTerms);
  assert.equal(refusal.status,"APPLIED");
  if(refusal.status==="APPLIED")assert.equal(refusal.result.approved,false);
  assert.equal((await standingCreativeAgreementAsActor(ctx,refusalTerms)).status,"REPLAYED");
  await assert.rejects(standingCreativeAgreementAsActor(ctx,{
   ...refusalTerms,requestId:"bob-reroll",expectedRevision:4,
   permittedOutcome:"WIN_ONLY"
  }),/already considered different terms/);
  // An approval must survive a genuine single-World-Lock handoff. Clear the
  // separate fixture's refused contract right, then restore Alice's agreed
  // winner and finish without requesting a new decision from her.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET creative_control='NONE'"+
   " WHERE world_id=$1 AND person_id='bob'",[world]));
  const restored=await saveCardEditorAsActor(ctx,{...ids,
   requestId:"restore-script",expectedRevision:4,
   matches:[{slotId:"bout",payload:match()}],
   segments:[],runningOrder:["bout"]});
  assert.equal(restored.status,"APPLIED");
  const again=await showCardEditorAsActor(ctx,world,promotion,show);
  assert.equal(again.creativeConcerns[0]?.approvalSource,"STANDING_PROGRAMME");
  assert.equal((await markPreparedShowReadyAsActor(ctx,{...ids,
   requestId:"ready-again",expectedRevision:5,confirmReadyToRun:true})).status,"APPLIED");
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=now()-interval '1 minute' WHERE world_id=$1",
   [world]));
  assert.equal((await lockWorldWeek(db.pool,{
   worldId:world,requestId:"lock",expectedRevision:6})).status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{
   worldId:world,requestId:"continuity",expectedRevision:7})).status,"APPLIED");
  const handed=await finalizePreparedWorldShows(db.pool,{
   worldId:world,requestId:"finalize",expectedRevision:8});
  assert.equal(handed.status,"APPLIED");
  if(handed.status==="APPLIED"){
   assert.deepEqual(handed.result.review,[]);
   assert.deepEqual(handed.result.submittedShowIds,[show]);
  }
  const finalCard=await withWorldTransaction(db.pool,tx=>tx.query<{
   status:string;payload:{scriptedWinnerSide:string;plannedFinish:string}
  }>(
   "SELECT d.status,s.payload FROM ppw_booking_drafts d JOIN ppw_card_slots s"+
   " ON s.world_id=d.world_id AND s.draft_id=d.draft_id"+
   " WHERE d.world_id=$1 AND d.draft_id=$2 AND s.slot_id='bout'",[world,show]));
  assert.deepEqual(finalCard.map(x=>[x.status,x.payload.scriptedWinnerSide,x.payload.plannedFinish]),
   [["SUBMITTED","A","CLEAN_PIN"]],"The World cannot rewrite a signed finish");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_week_prepared_finalizations",
    "ppw_week_continuity_assessments",
    "ppw_command_receipts","ppw_programme_match_activities",
    "ppw_match_creative_consents","ppw_programme_creative_agreements",
    "ppw_card_slots","ppw_booking_drafts","ppw_programme_side_refs",
    "ppw_programmes","ppw_contracts","ppw_people","ppw_venues",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_markets"]){
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   }
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,other]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
