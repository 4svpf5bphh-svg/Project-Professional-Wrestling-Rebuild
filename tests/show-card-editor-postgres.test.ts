import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import type {TransactionPool} from "../src/db/transaction.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor,
 markPreparedShowReadyAsActor} from "../src/api/world-service.js";
import {sideIdAt} from "../src/domain/match-sides.js";
const url=process.env.PPW_NEON_TEST_URL;
for(const mode of ["ROYAL","TEAMS"] as const){
 test("authored "+mode+" card saves, reorders, scopes roster and invalidates readiness",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),world="card-editor-"+randomUUID();
  const promotion="local",show="weekly",player="player-"+randomUUID();
  const ids=Array.from({length:mode==="ROYAL"?30:6},(_,i)=>"p"+i);
  const context={pool:db.pool,actor:{playerId:player}};
  const identity={worldId:world,promotionId:promotion,showId:show};
  const members=ids.map(id=>({personId:id,contractId:"deal-"+id}));
  const teams=mode==="ROYAL"?ids.length:3,size=mode==="ROYAL"?1:2;
  const sides=Array.from({length:teams},(_,i)=>({sideId:sideIdAt(i),
   participants:members.slice(i*size,(i+1)*size)}));
  const raw={matchType:mode==="ROYAL"?"BATTLE_ROYAL":"TAG",
   family:mode==="ROYAL"?"INDIVIDUAL":"TEAMS",
   sides,participants:members,scriptedWinnerSide:sides.at(-1)!.sideId,
   ruleset:"ELIMINATION",eliminationOrder:sides.slice(0,-1).map(x=>x.sideId),
   plannedFinish:mode==="ROYAL"?"OVER_THE_TOP_ROPE":"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:28};
  try{
   await withWorldTransaction(db.pool,async tx=>{
    await createWorld(tx,{id:world,name:"Booking editor CI",seed:45,rulesetVersion:"test"});
    await addPromotion(tx,world,{id:promotion,name:"Local",tier:"LOCAL"});
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
    await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
    await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Heartland',65,75,100)",[world]);
    await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Main Hall','home')",[world]);
    for(const id of ids){
     await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
      [world,id,"Talent "+id]);
     await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
      [world,"deal-"+id,id,promotion]);
    }
    await tx.query("INSERT INTO ppw_portable_personas(world_id,person_id,persona,provenance,introduced_week_index) VALUES($1,'p0',$2::jsonb,'GAME_AUTHORED',0)",
     [world,JSON.stringify({personaName:"The Iron Wave",gimmickId:"power-wrestler",
      primaryStyle:"BRAWLER",secondaryStyle:null,
      signatureMoves:[{name:"Iron Whip",category:"STRIKE",source:"PPW_AUTHORED"}],
      finishingMoves:[],source:"GAME_AUTHORED"})]);
    await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,show_name,booking_class) VALUES($1,$2,$3,1,1,'DRAFT',3,'hall','home','Wednesday Night Live','REGULAR')",
     [world,show,promotion]);
    await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'angle',0,'SEGMENT',$3::jsonb)",
     [world,show,JSON.stringify({participants:[members[0]],kind:"PROMO",outcome:"HAPPENS"})]);
   });
   const view=await showCardEditorAsActor(context,world,promotion,show);
   assert.equal(view.canEdit,true);
   assert.equal(view.showName,"Wednesday Night Live");
   assert.equal(view.promotionName,"Local");
   assert.equal(view.venueName,"Main Hall");
   assert.equal(view.marketName,"Heartland");
   assert.equal(view.day,3);
   assert.equal(view.bookingClass,"REGULAR");
   assert.deepEqual(view.slots.map(s=>s.slotId),["angle"]);
   const page=await cardTalentAsActor(context,world,promotion,show,"Talent",null,10);
   assert.equal(page.talent.length,Math.min(10,ids.length));
   assert.ok(page.talent.every(t=>t.available));
   const renamed=page.talent.find(person=>person.personId==="p0");
   assert.equal(renamed?.ringName,"The Iron Wave");
   assert.equal(renamed?.primaryStyle,"BRAWLER");
   assert.equal(renamed?.signatureMove,"Iron Whip");
   assert.equal(renamed?.finisherMove,null,
    "Intentionally empty edited finisher list must not resurrect a baseline move");
   if(ids.length>10){
    assert.ok(page.cursor);
    const next=await cardTalentAsActor(context,world,promotion,show,"Talent",page.cursor,10);
    assert.equal(next.talent.length,10);
    assert.equal(new Set([...page.talent,...next.talent].map(x=>x.personId)).size,20);
   }else assert.equal(page.cursor,null);
   const save=(requestId:string,expectedRevision:number,runningOrder:string[])=>
    saveCardEditorAsActor(context,{...identity,requestId,expectedRevision,
     matches:[{slotId:"main",payload:raw}],runningOrder});
   await assert.rejects(save("bad",0,["main"]),/running order|Running order|slot/i);
   const meter=new MeasuredQuerySession("edit-"+mode+"-whole-card");
   const meteredPool:TransactionPool={
    async connect(){
     const connection=await db.pool.connect();
     return {
      release(){connection.release();},
      async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
       return meter.execute(()=>connection.query<T>(sql,params));
      }
     };
    }
   };
   const first=await saveCardEditorAsActor({...context,pool:meteredPool},
    {...identity,requestId:"save-1",expectedRevision:0,
     matches:[{slotId:"main",payload:raw}],runningOrder:["main","angle"]});
   const sample=meter.assertBudget({maxQueries:15,maxResultBytes:40_000});
   assert.ok(sample.queryCount>=12);
   console.log("PPW booking card query budget:",JSON.stringify(sample));
   assert.equal(first.status,"APPLIED");
   assert.equal(first.result.performers,ids.length);
   assert.equal((await save("save-1",0,["main","angle"])).status,"REPLAYED");
   const saved=await showCardEditorAsActor(context,world,promotion,show);
   assert.equal(saved.slots.length,2);
   assert.equal(saved.selectedPeople.length,ids.length);
   assert.equal(saved.slots[0]!.slotId,"main");
   assert.equal((saved.slots[0]!.payload as {participants:unknown[]}).participants.length,ids.length);
   assert.equal((await markPreparedShowReadyAsActor(context,{...identity,
     requestId:"ready",expectedRevision:1,confirmReadyToRun:true})).status,"APPLIED");
   assert.equal((await showCardEditorAsActor(context,world,promotion,show)).ready,true);
   const again=await save("save-2",2,["angle","main"]);
   assert.equal(again.status,"APPLIED");
   const changed=await showCardEditorAsActor(context,world,promotion,show);
   assert.equal(changed.ready,false);
   assert.deepEqual(changed.slots.map(s=>s.slotId),["angle","main"]);
   const stale=await save("stale",2,["main","angle"]);
   assert.equal(stale.status,"STALE");
   assert.equal((await showCardEditorAsActor(context,world,promotion,show)).slots[0]!.slotId,"angle");
   const foreign={pool:db.pool,actor:{playerId:"intruder"}};
   await assert.rejects(showCardEditorAsActor(foreign,world,promotion,show),/not accessible/);
   await assert.rejects(saveCardEditorAsActor(foreign,{...identity,
    requestId:"intrude",expectedRevision:3,
    matches:[{slotId:"main",payload:raw}],runningOrder:["main","angle"]}),/not accessible/);
   const forged={...raw,participants:members.map((p,i)=>i===0?{
    ...p,contractId:"fake"}:p),sides:sides.map((s,i)=>({...s,
    participants:i===0?s.participants.map((p,j)=>j===0?{
     ...p,contractId:"fake"}:p):s.participants}))};
   await assert.rejects(saveCardEditorAsActor(context,{...identity,
    requestId:"forged",expectedRevision:3,
    matches:[{slotId:"main",payload:forged}],runningOrder:["main","angle"]}),/contract rights|Multiple contracts/);

   assert.equal((await showCardEditorAsActor(context,world,promotion,show)).slots[0]!.slotId,"angle");
   // A complete angle is now authored and saved with its contracted cast,
   // scripted refusal and precise slot order in one World revision.
   const angle={kind:"ATTACK",participants:[members[0],members[1]],
    actorIds:[ids[0]],targetIds:[ids[1]],outcome:"REFUSED"};
   const angleSave=await saveCardEditorAsActor(context,{...identity,
    requestId:"save-angle",expectedRevision:3,
    matches:[{slotId:"main",payload:raw}],
    segments:[{slotId:"angle",payload:angle}],
    runningOrder:["angle","main"]});
   assert.equal(angleSave.status,"APPLIED");
   const withAngle=await showCardEditorAsActor(context,world,promotion,show);
   assert.deepEqual(withAngle.slots.map(s=>s.slotId),["angle","main"]);
   assert.deepEqual((withAngle.slots[0]!.payload as typeof angle).actorIds,[ids[0]]);
   assert.equal((withAngle.slots[0]!.payload as typeof angle).outcome,"REFUSED");
   assert.equal((await saveCardEditorAsActor(context,{...identity,
    requestId:"save-angle",expectedRevision:3,
    matches:[{slotId:"main",payload:raw}],
    segments:[{slotId:"angle",payload:angle}],
    runningOrder:["angle","main"]})).status,"REPLAYED");
   await assert.rejects(saveCardEditorAsActor(context,{...identity,
    requestId:"forged-angle",expectedRevision:4,
    matches:[{slotId:"main",payload:raw}],
    segments:[{slotId:"angle",payload:{...angle,participants:[
     {...members[0],contractId:"fake"},members[1]]}}],
    runningOrder:["angle","main"]}),/contract rights|Multiple contracts/);
   // Storyline links are promotion-owned, authenticated, revision-gated and
   // saved atomically with the angle rather than inferred at resolution.
   await withWorldTransaction(db.pool,async tx=>{
    await tx.query(
     "INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition)"+
     " VALUES($1,$2,'feud','ACTIVE',72,2)",[world,promotion]);
    await tx.query(
     "INSERT INTO ppw_programme_side_refs(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id)"+
     " VALUES($1,$2,'feud','A',0,'PERSON',$3),($1,$2,'feud','B',0,'PERSON',$4)",
     [world,promotion,ids[0],ids[1]]);
   });
   const linked=await saveCardEditorAsActor(context,{...identity,
    requestId:"link-feud",expectedRevision:4,
    matches:[{slotId:"main",payload:raw}],
    segments:[{slotId:"angle",payload:angle,programmeId:"feud"}],
    runningOrder:["angle","main"]});
   assert.equal(linked.status,"APPLIED");
   const withLink=await showCardEditorAsActor(context,world,promotion,show);
   assert.deepEqual(withLink.programmeLinks,[{slotId:"angle",programmeId:"feud"}]);
   assert.equal(withLink.programmes[0]!.heat,72);
   await assert.rejects(saveCardEditorAsActor(context,{...identity,
    requestId:"invalid-feud",expectedRevision:5,
    matches:[{slotId:"main",payload:raw}],
    segments:[{slotId:"angle",payload:angle,programmeId:"foreign"}],
    runningOrder:["angle","main"]}),/Only active promotion programmes/);
   assert.deepEqual((await showCardEditorAsActor(context,world,promotion,show)).programmeLinks,
    [{slotId:"angle",programmeId:"feud"}]);
   // Full authorised PostgreSQL save, failed order, and unchanged query budget
   // for match-linked post-show attacks. The match finish is untouched.
   const aftermath={kind:"POST_MATCH_ASSAULT",outcome:"HAPPENS",
    actorIds:[ids[1]],targetIds:[ids[0]],participants:[members[1],members[0]],
    sourceMatchSlotId:"main",creativeBeat:{
     kind:"POST_MATCH_ASSAULT",ending:"VICTIM_FIGHTS_BACK"}};
   const anchored=(requestId:string,sourceMatchSlotId:string,runningOrder:string[],
    pool=db.pool)=>saveCardEditorAsActor({...context,pool},{
    ...identity,requestId,expectedRevision:5,
    matches:[{slotId:"main",payload:raw}],
    segments:[{slotId:"angle",payload:{...aftermath,sourceMatchSlotId}}],
    runningOrder});
   await assert.rejects(anchored("wrong-running-order","main",["angle","main"]),
    /must follow a match/);
   await assert.rejects(anchored("wrong-match","other-promotion",["main","angle"]),
    /must follow a match/);
   assert.equal((await showCardEditorAsActor(context,world,promotion,show)).worldRevision,5);
   const anchoredMeter=new MeasuredQuerySession("anchored-angle-"+mode);
   const anchorPool:TransactionPool={async connect(){
    const connection=await db.pool.connect();
    return {release(){connection.release();},
     async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
      return anchoredMeter.execute(()=>connection.query<T>(sql,params));
     }};
   }};
   const anchoredSave=await anchored("anchor-valid","main",["main","angle"],anchorPool);
   assert.equal(anchoredSave.status,"APPLIED");
   anchoredMeter.assertBudget({maxQueries:15,maxResultBytes:40_000});
   const withAftermath=await showCardEditorAsActor(context,world,promotion,show);
   assert.deepEqual(withAftermath.slots.map(s=>s.slotId),["main","angle"]);
   assert.equal((withAftermath.slots[1]!.payload as typeof aftermath).sourceMatchSlotId,"main");
   assert.equal(((withAftermath.slots[1]!.payload as typeof aftermath).creativeBeat).ending,
    "VICTIM_FIGHTS_BACK");
   assert.equal((withAftermath.slots[0]!.payload as typeof raw).scriptedWinnerSide,
    raw.scriptedWinnerSide);
   const remove=await saveCardEditorAsActor(context,{...identity,
    requestId:"remove-angle",expectedRevision:6,
    matches:[{slotId:"main",payload:raw}],segments:[],runningOrder:["main"]});
   assert.equal(remove.status,"APPLIED");
   assert.deepEqual((await showCardEditorAsActor(context,world,promotion,show)).programmeLinks,[]);

   // World is Week 3 with NO Week 3 show. Saved Week 4/5 shows remain
   // individually editable and cannot leak into a rival controller's desk.
   await withWorldTransaction(db.pool,async tx=>{
    await tx.query("UPDATE ppw_worlds SET week=3 WHERE world_id=$1",[world]);
    await tx.query(`INSERT INTO ppw_booking_drafts
      (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,booking_class)
      VALUES($1,'future-4',$2,1,4,'DRAFT',5,'hall','home','REGULAR'),
      ($1,'future-5',$2,1,5,'DRAFT',5,'hall','home','REGULAR'),
      ($1,'future-10',$2,1,10,'DRAFT',5,'hall','home','REGULAR')`,
      [world,promotion]);
   });
   for(const [future,revision] of [["future-4",7],["future-5",8]] as const){
    const editable=await showCardEditorAsActor(context,world,promotion,future);
    assert.equal(editable.canEdit,true);
    assert.equal(editable.week,future==="future-4"?4:5);
    const savedFuture=await saveCardEditorAsActor(context,{...identity,
     showId:future,requestId:"save-"+future,expectedRevision:revision,
     matches:[{slotId:"headline",payload:raw}],runningOrder:["headline"]});
    assert.equal(savedFuture.status,"APPLIED");
    const reloaded=await showCardEditorAsActor(context,world,promotion,future);
    assert.equal(reloaded.slots.length,1);
    assert.equal((reloaded.slots[0]!.payload as typeof raw).scriptedWinnerSide,
     raw.scriptedWinnerSide);
    await assert.rejects(showCardEditorAsActor(foreign,world,promotion,future),/not accessible/);
   }
   const tooDistant=await showCardEditorAsActor(context,world,promotion,"future-10");
   assert.equal(tooDistant.canEdit,false);
   await assert.rejects(saveCardEditorAsActor(context,{...identity,
    showId:"future-10",requestId:"too-distant",expectedRevision:9,
    matches:[{slotId:"headline",payload:raw}],runningOrder:["headline"]}),
    /advance booking window/);
   // Six weeks after Week 3 (Week 9) is still editable.
   await withWorldTransaction(db.pool,tx=>tx.query(
    "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,booking_class)"+
    " VALUES($1,'future-9',$2,1,9,'DRAFT',5,'hall','home','REGULAR')",
    [world,promotion]));
   assert.equal((await showCardEditorAsActor(context,world,promotion,"future-9")).canEdit,true);
   // Advance ONLY this disposable test World. A player-saved Week 4 show
   // must be picked up at World Lock with no extra confirmation.
   await withWorldTransaction(db.pool,tx=>tx.query(
    "UPDATE ppw_worlds SET week=4,next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
    [world]));
   assert.equal((await lockWorldWeek(db.pool,{
    worldId:world,requestId:"future-lock",expectedRevision:9})).status,"APPLIED");
   assert.equal((await recordWeekContinuity(db.pool,{
    worldId:world,requestId:"future-continuity",expectedRevision:10})).status,"APPLIED");
   const finalized=await finalizePreparedWorldShows(db.pool,{
    worldId:world,requestId:"future-finalize",expectedRevision:11});
   assert.equal(finalized.status,"APPLIED");
   if(finalized.status!=="APPLIED")throw new Error("Expected prepared show finalization");
   assert.deepEqual(finalized.result.submittedShowIds,["future-4"]);
   const savedStatus=await withWorldTransaction(db.pool,tx=>tx.query<{draft_id:string;status:string}>(
    "SELECT draft_id,status FROM ppw_booking_drafts WHERE world_id=$1 AND draft_id=ANY($2::text[]) ORDER BY draft_id",
    [world,["future-4","future-5","future-9"]]));
   assert.deepEqual(savedStatus.map(r=>r.status),["SUBMITTED","DRAFT","DRAFT"]);
  }finally{
   await withWorldTransaction(db.pool,async tx=>{
    for(const table of ["ppw_ledger_events","ppw_week_prepared_finalizations",
      "ppw_week_continuity_assessments","ppw_week_logistics_authorizations",
      "ppw_command_receipts","ppw_programme_match_activities",
     "ppw_programme_side_refs","ppw_programmes","ppw_card_slots",
     "ppw_booking_drafts","ppw_portable_personas","ppw_contracts","ppw_people",
     "ppw_venues","ppw_promotion_controls","ppw_memberships",
     "ppw_promotions","ppw_markets"])await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
    await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
    await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
   }).finally(()=>db.close());
  }
 });
}

test("authored run-ins are roster-contracted, charged as an appearance and remain one-query-batch",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),world="run-in-"+randomUUID();
 const promotion="arena",show="weekly",player="owner-"+randomUUID();
 const context={pool:db.pool,actor:{playerId:player}};
 const scope={worldId:world,promotionId:promotion,showId:show};
 const a={personId:"alice",contractId:"deal-alice"};
 const b={personId:"bob",contractId:"deal-bob"};
 const raw={
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[a]},{sideId:"B",participants:[b]}],
  participants:[a,b],scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
  intent:"COMPETITIVE",plannedLengthMinutes:18,
  interference:{personId:"outsider",contractId:"deal-outsider",
   aidedSide:"A",plannedOutcome:"SUCCESS"}
 };
 const save=(payload:unknown,requestId:string,revision:number,pool=db.pool)=>
  saveCardEditorAsActor({pool,actor:{playerId:player}},{...scope,requestId,
   expectedRevision:revision,matches:[{slotId:"bout",payload}],runningOrder:["bout"]});
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Run-in trial",seed:15,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Arena",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',75,80,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id,capacity,weekly_hire_cost,status) VALUES($1,'hall','Hall','home',2500,12000,'ACTIVE')",[world]);
   for(const id of ["alice","bob","outsider"]){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [world,id,id]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
     [world,"deal-"+id,id,promotion]);
   }
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id) VALUES($1,$2,$3,1,1,'DRAFT',3,'hall','home')",[world,show,promotion]);
  });
  const meter=new MeasuredQuerySession("run-in-contracts-bulk");
  const wrapped:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},async query<T extends Record<string,unknown>>(
    sql:string,args:readonly unknown[]){return meter.execute(()=>client.query<T>(sql,args));}};
  }};
  const applied=await save(raw,"save",0,wrapped);
  assert.equal(applied.status,"APPLIED");
  assert.equal(applied.result.performers,3,"Run-in costs a wrestler appearance");
  assert.equal(meter.assertBudget({maxQueries:15,maxResultBytes:40_000}).queryCount<=15,true);
  const saved=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(saved.selectedPeople.length,3,"Run-in wrestler keeps a name after reloading the card");
  assert.deepEqual((saved.slots[0]?.payload as typeof raw).interference,raw.interference);
  assert.equal((await save(raw,"save",0)).status,"REPLAYED");
  await assert.rejects(save({...raw,interference:{...raw.interference,
   contractId:"fake"}}, "wrong-agreement",1),/contract rights/);
  await assert.rejects(save({...raw,interference:{...raw.interference,
   contractId:undefined}},"missing-agreement",1),/signed agreement/);
  await assert.rejects(save({...raw,interference:{...raw.interference,
   personId:"alice"}},"self-interference",1),/outside the match/);
  await assert.rejects(save({...raw,interference:{...raw.interference,
   aidedSide:"B"}},"wrong-winner",1),/support the winner/);
  const failed=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(failed.worldRevision,1);
  assert.equal((failed.slots[0]?.payload as typeof raw).interference.personId,"outsider");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_programme_match_activities",
    "ppw_card_slots","ppw_booking_drafts","ppw_contracts","ppw_people",
    "ppw_venues","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

// Reproduces the iPhone playtest: an existing confirmed four-bout card with
// three separately scripted angles is revised using a newly signed wrestler.
// The saved show stays intact until the replacement is accepted atomically.
test("a confirmed four-match three-angle card can be recast, saved and reconfirmed",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),world="recast-"+randomUUID(),promotion="office",show="friday",player="booker-"+randomUUID();
 const context={pool:db.pool,actor:{playerId:player}};
 const id={worldId:world,promotionId:promotion,showId:show};
 const pick=(n:number)=>({personId:"w"+n,contractId:"deal-w"+n});
 const match=(slot:string,a:number,b:number)=>({slotId:slot,payload:{
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[pick(a)]},{sideId:"B",participants:[pick(b)]}],
  participants:[pick(a),pick(b)],scriptedWinnerSide:"A",
  plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:18
 }});
 const angle=(slot:string,kind:"ATTACK"|"PROMO"|"INTERVIEW",actors:number[],targets:number[],durationMinutes:number)=>({
  slotId:slot,payload:{kind,actorIds:actors.map(n=>"w"+n),targetIds:targets.map(n=>"w"+n),
   participants:[...actors,...targets].map(pick),outcome:"HAPPENS",durationMinutes}
 });
 const segments=[angle("angle1","ATTACK",[0],[1],5),
  angle("angle2","PROMO",[2],[],4),angle("angle3","INTERVIEW",[6],[],6)];
 const runningOrder=["angle1","bout1","bout2","angle2","bout3","angle3","bout4"];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Rebooking Playtest",seed:75,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Crown",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',65,75,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'arena','Arena','home')",[world]);
   for(let n=0;n<9;n++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,default_alignment) VALUES($1,$2,$3,'MEN',$4)",
     [world,"w"+n,"Wrestler "+n,n%2?"HEEL":"FACE"]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
     [world,"deal-w"+n,"w"+n,promotion]);
   }
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,show_name,booking_class) VALUES($1,$2,$3,1,1,'DRAFT',5,'arena','home','Friday Wrestling','REGULAR')",
    [world,show,promotion]);
  });
  const original=[match("bout1",0,1),match("bout2",2,3),match("bout3",4,5),match("bout4",6,7)];
  const saved=await saveCardEditorAsActor(context,{...id,requestId:"initial-card",expectedRevision:0,
   matches:original,segments,runningOrder});
  assert.equal(saved.status,"APPLIED");
  const first=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(first.slots.length,7);
  assert.equal(first.selectedPeople.find(x=>x.personId==="w0")?.alignment,"FACE");
  assert.equal(first.selectedPeople.find(x=>x.personId==="w1")?.alignment,"HEEL");
  const prepared=await markPreparedShowReadyAsActor(context,{...id,requestId:"ready-initial",
   expectedRevision:1,confirmReadyToRun:true});
  assert.equal(prepared.status,"APPLIED");
  assert.equal((await showCardEditorAsActor(context,world,promotion,show)).ready,true);
  const revised=[...original.slice(0,2),match("bout3",8,5),original[3]!];
  const amended=await saveCardEditorAsActor(context,{...id,requestId:"recast-card",expectedRevision:2,
   matches:revised,segments,runningOrder});
  assert.equal(amended.status,"APPLIED");
  const after=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(after.ready,false,"Recasting must invalidate the previous confirmation");
  assert.equal(after.slots.length,7);
  assert.equal(after.slots.filter(s=>s.kind==="MATCH").length,4);
  assert.equal(after.slots.filter(s=>s.kind==="SEGMENT").length,3);
  assert.equal(after.selectedPeople.some(p=>p.personId==="w8"),true);
  assert.equal(after.selectedPeople.some(p=>p.personId==="w4"),false);
  assert.equal((after.slots.find(s=>s.slotId==="angle2")?.payload as {durationMinutes:number}).durationMinutes,4);
  const confirmed=await markPreparedShowReadyAsActor(context,{...id,requestId:"ready-recast",
   expectedRevision:3,confirmReadyToRun:true});
  assert.equal(confirmed.status,"APPLIED");
  assert.equal((await showCardEditorAsActor(context,world,promotion,show)).ready,true);
 }finally{await db.close();}
});

test("renewed signed agreements are immediately bookable in next week's preplanned card",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),key=randomUUID(),world="renewal-picker-"+key;
 const player="booker-"+key,outsider="rival-"+key,promotion="local",show="future-show";
 const context={pool:db.pool,actor:{playerId:player}};
 const make=(aContract:string)=>({
  matchType:"SINGLES",family:"INDIVIDUAL",
  sides:[{sideId:"A",participants:[{personId:"austin",contractId:aContract}]},
   {sideId:"B",participants:[{personId:"bob",contractId:"bob-current"}]}],
  participants:[{personId:"austin",contractId:aContract},
   {personId:"bob",contractId:"bob-current"}],
  scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",
  plannedLengthMinutes:18
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Signed renewal CI",seed:15,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Local",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,outsider]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[world,player,outsider]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'market','Market',65,70,90)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'hall','Arena','market')",[world]);
   for(const person of ["austin","bob"])
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",[world,person,person]);
   for(const [id,person,start,end,status] of [
    ["austin-expired","austin",0,0,"SIGNED"],
    ["austin-renewed","austin",1,14,"SIGNED"],
    ["bob-current","bob",0,52,"SIGNED"]
   ] as const)
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,start_week_index,remaining_dates,expires_week_index,appearance_fee) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE',$5,$6,9,$7,9000)",[
     world,id,person,promotion,status,start,end
    ]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id,booking_class) VALUES($1,$2,$3,1,2,'DRAFT',3,'hall','market','REGULAR')",[world,show,promotion]);
  });
  const talent=await cardTalentAsActor(context,world,promotion,show,"austin",null,40);
  assert.equal(talent.talent.length,1,"Future-card picker must not offer expired old agreements");
  assert.equal(talent.talent[0]!.contractId,"austin-renewed");
  assert.equal(talent.talent[0]!.available,true);
  await assert.rejects(saveCardEditorAsActor(context,{
   worldId:world,promotionId:promotion,showId:show,
   requestId:"old-contract",expectedRevision:0,
   matches:[{slotId:"main",payload:make("austin-expired")}],
   runningOrder:["main"]
  }),/contract rights.*Week 2/i);
  const saved=await saveCardEditorAsActor(context,{
   worldId:world,promotionId:promotion,showId:show,
   requestId:"renewal-booking",expectedRevision:0,
   matches:[{slotId:"main",payload:make("austin-renewed")}],
   runningOrder:["main"]
  });
  assert.equal(saved.status,"APPLIED");
  const view=await showCardEditorAsActor(context,world,promotion,show);
  assert.equal(view.slots.length,1);
  assert.ok(view.selectedPeople.some(p=>p.personId==="austin"&&
   p.contractId==="austin-renewed"),"Reload must use the current signed renewal");
  await assert.rejects(cardTalentAsActor({
   pool:db.pool,actor:{playerId:outsider}
  },world,promotion,show,"austin",null,40),/access|owner|promotion|controller/i);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_programme_match_activities","ppw_card_slots",
    "ppw_booking_drafts","ppw_command_receipts","ppw_ledger_events",
    "ppw_promotion_talent_trust","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_venues","ppw_people","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,outsider]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
