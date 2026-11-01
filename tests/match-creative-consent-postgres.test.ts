import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {showCardEditorAsActor,requestMatchConsentAsActor,
 saveCardEditorAsActor,markPreparedShowReadyAsActor}
 from "../src/api/world-service.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import type {TransactionPool} from "../src/db/transaction.js";
const url=process.env.PPW_NEON_TEST_URL;
test("contractual veto, consent, refusal, rewritten finish and confirmed card are authoritative",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,4);
 const id=randomUUID(),world="creative-"+id,player="owner-"+id;
 const context={pool:db.pool,actor:{playerId:player}};
 const show="weekly",promotion="local";
 const alice={personId:"alice",contractId:"alice-deal"};
 const bob={personId:"bob",contractId:"bob-deal"};
 const match=(finish="CLEAN_PIN")=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[bob]}],
  participants:[alice,bob],scriptedWinnerSide:"A",plannedFinish:finish,
  intent:"COMPETITIVE",plannedLengthMinutes:18
 });
 const info={worldId:world,promotionId:promotion,showId:show};
 const agree=(personId:string,requestId:string,expectedRevision:number)=>
  requestMatchConsentAsActor(context,{
   ...info,slotId:"main",personId,requestId,expectedRevision
  });
 const ready=(revision:number,requestId:string)=>markPreparedShowReadyAsActor(context,{
  ...info,requestId,expectedRevision:revision,confirmReadyToRun:true
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Contract rehearsal",seed:44,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Local",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Hall','home')",[world]);
   for(const [person,control,morale,fatigue] of [
    ["alice","FULL_APPROVAL",85,4],["bob","PROTECTED_FINISHES",2,90]
   ] as const){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,fatigue,contract_priorities) VALUES($1,$2,$3,'MEN',$4,$5,$6::jsonb)",
     [world,person,person,morale,fatigue,JSON.stringify({
      money:40,role:90,prestige:50,schedule:45,loyalty:10,exposure:50})]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index,creative_control,role_expectation) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52,$5,'MAIN_EVENT')",
     [world,person+"-deal",person,promotion,control]);
   }
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,booking_class) VALUES($1,$2,$3,1,1,'DRAFT',3,'hall','home','REGULAR')",
    [world,show,promotion]);
   await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'main',0,'MATCH',$3::jsonb)",
    [world,show,JSON.stringify(match())]);
  });
  const meter=new MeasuredQuerySession("one-card-creative-review");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const first=await showCardEditorAsActor({...context,pool:measured},world,promotion,show);
  assert.equal(first.creativeConcerns.length,2);
  assert.equal(first.creativeConcerns.find(x=>x.personId==="alice")?.reason,"MATCH_APPROVAL");
  assert.equal(first.creativeConcerns.find(x=>x.personId==="bob")?.reason,"PROTECTED_LOSS");
  meter.assertBudget({maxQueries:9,maxResultBytes:13000});
  await assert.rejects(ready(0,"not-yet"),/creative agreement/);
  const approved=await agree("alice","alice-yes",0);
  assert.equal(approved.status,"APPLIED");
  assert.equal(approved.result.decision,"APPROVED");
  assert.equal((await agree("alice","alice-yes",0)).status,"REPLAYED");
  const refused=await agree("bob","bob-no",1);
  assert.equal(refused.status,"APPLIED");
  if(refused.status==="APPLIED")assert.equal(refused.result.decision,"DECLINED");
  await assert.rejects(ready(2,"still-blocked"),/creative agreement/);
  const changed=await saveCardEditorAsActor(context,{
   ...info,requestId:"rebook",expectedRevision:2,
   matches:[{slotId:"main",payload:match("PROTECTED_FINISH")}],
   segments:[],runningOrder:["main"]
  });
  assert.equal(changed.status,"APPLIED");
  const reviewed=await showCardEditorAsActor(context,world,promotion,show);
  assert.deepEqual(reviewed.creativeConcerns.map(x=>x.personId),["alice"]);
  assert.equal(reviewed.creativeConcerns[0]!.decision,"NOT_REQUESTED",
   "Changing the scripted finish voids earlier permission");
  await assert.rejects(ready(3,"stale-consent"),/creative agreement/);
  const revised=await agree("alice","alice-revised",3);
  assert.equal(revised.status,"APPLIED");
  if(revised.status==="APPLIED")assert.equal(revised.result.decision,"APPROVED");
  assert.equal((await ready(4,"confirmed")).status,"APPLIED");
  const confirmed=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(confirmed.ready,true);
  assert.equal((confirmed.slots[0]!.payload as {plannedFinish:string}).plannedFinish,
   "PROTECTED_FINISH","A wrestler's answer never rewrites the finish");
  await assert.rejects(agree("alice","late",5),/save|card|agreement|current/i);
  // A changed contracted right between confirmation and lock cannot silently
  // materialise the prior script, even though the ready fingerprint still fits.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_contracts SET creative_control='FULL_APPROVAL'"+
   " WHERE world_id=$1 AND contract_id='bob-deal'",[world]));
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=now()-interval '1 minute' WHERE world_id=$1",
   [world]));
  assert.equal((await lockWorldWeek(db.pool,{
   worldId:world,requestId:"lock",expectedRevision:5})).status,"APPLIED");
  assert.equal((await recordWeekContinuity(db.pool,{
   worldId:world,requestId:"continuity",expectedRevision:6})).status,"APPLIED");
  const final=await finalizePreparedWorldShows(db.pool,{
   worldId:world,requestId:"finalize",expectedRevision:7});
  assert.equal(final.status,"APPLIED");
  if(final.status==="APPLIED")
   assert.deepEqual(final.result.review,[{
    showId:show,reason:"CREATIVE_APPROVAL_REQUIRED"}]);
  const submissions=await withWorldTransaction(db.pool,tx=>tx.query<{status:string}>(
   "SELECT status FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=$2",
   [world,show]));
  assert.equal(submissions[0]!.status,"DRAFT");

 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_week_prepared_finalizations",
    "ppw_week_continuity_assessments",
    "ppw_match_creative_consents","ppw_card_slots",
    "ppw_command_receipts","ppw_booking_drafts","ppw_contracts",
    "ppw_promotion_controls","ppw_memberships","ppw_venues",
    "ppw_promotion_market_states","ppw_people","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("unsaved tournament match can obtain exact creative consent without a fake feud or card save",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),suffix=randomUUID();
 const world="unsaved-consent-"+suffix,player="owner-"+suffix,outsider="outsider-"+suffix;
 const promotion="local",show="weekly",tournament="contenders";
 const context={pool:db.pool,actor:{playerId:player}};
 const alice={personId:"alice",contractId:"deal-alice"};
 const bob={personId:"bob",contractId:"deal-bob"};
 const match=(opponent=bob,finish="CLEAN_PIN")=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[alice]},{sideId:"B",participants:[opponent]}],
  participants:[alice,opponent],scriptedWinnerSide:"A",plannedFinish:finish,
  intent:"COMPETITIVE",plannedLengthMinutes:18,
  tournamentId:tournament,tournamentBoutNo:1
 });
 const input={worldId:world,promotionId:promotion,showId:show};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Draft consent CI",seed:99,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Contenders",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,outsider]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[world,player,outsider]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'market','Market',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Arena','market')",[world]);
   for(const person of ["alice","bob","gamma","delta"]){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,morale,fatigue,contract_priorities) VALUES($1,$2,$3,'MEN',95,0,$4::jsonb)",[
     world,person,person,JSON.stringify({money:40,role:50,prestige:50,schedule:45,loyalty:99,exposure:50})
    ]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index,creative_control,role_expectation) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',8,52,$5,'MAIN_EVENT')",[
     world,"deal-"+person,person,promotion,person==="alice"?"FULL_APPROVAL":"NONE"
    ]);
   }
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,booking_class) VALUES($1,$2,$3,1,1,'DRAFT',3,'hall','market','REGULAR')",[world,show,promotion]);
   await tx.query("INSERT INTO ppw_tournaments(world_id,promotion_id,tournament_id,name,division,status,created_week_index,entrants_count) VALUES($1,$2,$3,'Contenders','MEN','ACTIVE',0,4)",[world,promotion,tournament]);
   await tx.query("INSERT INTO ppw_tournament_bouts(world_id,promotion_id,tournament_id,bout_no,person_a,person_b) VALUES($1,$2,$3,1,'alice','bob'),($1,$2,$3,2,'gamma','delta')",[world,promotion,tournament]);
   await tx.query("INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition) VALUES($1,$2,'unrelated','ACTIVE',60,0)",[world,promotion]);
   await tx.query("INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id) VALUES($1,$2,'unrelated','A',0,'PERSON','gamma'),($1,$2,'unrelated','B',0,'PERSON','bob')",[world,promotion]);
  });
  await assert.rejects(requestMatchConsentAsActor(context,{
   ...input,slotId:"fixture",personId:"alice",requestId:"wrong-bracket",
   expectedRevision:0,proposedMatch:match({personId:"gamma",contractId:"deal-gamma"})
  }),/tournament|bracket/i);
  await assert.rejects(requestMatchConsentAsActor({
   pool:db.pool,actor:{playerId:outsider}
  },{...input,slotId:"fixture",personId:"alice",requestId:"not-owner",
   expectedRevision:0,proposedMatch:match()
  }),/access|show|owner|available|open/i);
  const asked=await requestMatchConsentAsActor(context,{
   ...input,slotId:"fixture",personId:"alice",requestId:"draft-approval",
   expectedRevision:0,proposedMatch:match()
  });
  assert.equal(asked.status,"APPLIED");
  if(asked.status==="APPLIED")assert.equal(asked.result.decision,"APPROVED");
  const beforeSave=await withWorldTransaction(db.pool,tx=>tx.query<{total:string}>(
   "SELECT count(*)::text AS total FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2",
   [world,show]));
  assert.equal(beforeSave[0]!.total,"0","A consent request must never save the card");
  const stale=await requestMatchConsentAsActor(context,{
   ...input,slotId:"fixture",personId:"alice",requestId:"stale-approval",
   expectedRevision:0,proposedMatch:match()
  });
  assert.equal(stale.status,"STALE");
  const saved=await saveCardEditorAsActor(context,{
   ...input,requestId:"book-fixture",expectedRevision:1,
   matches:[{slotId:"fixture",payload:match()}],
   segments:[],runningOrder:["fixture"]
  });
  assert.equal(saved.status,"APPLIED");
  const view=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(view.slots.length,1);
  assert.deepEqual(view.programmeLinks,[],"Tournament fixture must not join Riddle's unrelated feud");
  assert.equal(view.creativeConcerns.find(c=>c.personId==="alice")?.decision,"APPROVED");
  const confirmed=await markPreparedShowReadyAsActor(context,{
   ...input,requestId:"confirm",expectedRevision:2,confirmReadyToRun:true
  });
  assert.equal(confirmed.status,"APPLIED");
  const unchanged=await withWorldTransaction(db.pool,tx=>tx.query<{winner_person_id:string|null}>(
   "SELECT winner_person_id FROM ppw_tournament_bouts WHERE world_id=$1 AND promotion_id=$2 AND tournament_id=$3 AND bout_no=1",
   [world,promotion,tournament]));
  assert.equal(unchanged[0]!.winner_person_id,null,"Consent and booking do not fabricate results");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_match_creative_consents","ppw_programme_match_activities",
    "ppw_programme_side_refs","ppw_programmes","ppw_tournament_bouts",
    "ppw_tournaments","ppw_card_slots","ppw_booking_drafts",
    "ppw_command_receipts","ppw_ledger_events","ppw_promotion_talent_trust",
    "ppw_contracts","ppw_promotion_controls","ppw_memberships",
    "ppw_venues","ppw_people","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,outsider]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
