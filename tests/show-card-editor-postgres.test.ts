import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import type {TransactionPool} from "../src/db/transaction.js";
import {withWorldTransaction} from "../src/db/transaction.js";
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
   await withWorldTransaction(db.pool,tx=>tx.query(
    "INSERT INTO ppw_programmes(world_id,promotion_id,programme_id,status,heat,repetition)"+
    " VALUES($1,$2,'feud','ACTIVE',72,2)",[world,promotion]));
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
  }finally{
   await withWorldTransaction(db.pool,async tx=>{
    for(const table of ["ppw_command_receipts","ppw_programme_match_activities",
     "ppw_programmes","ppw_card_slots",
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
