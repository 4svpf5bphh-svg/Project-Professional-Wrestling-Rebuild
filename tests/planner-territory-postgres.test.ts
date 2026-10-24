import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readSixWeekPlanner,planShowWeek} from "../src/db/planner-workspace.js";
import {showCardEditorAsActor,saveCardEditorAsActor,markPreparedShowReadyAsActor}
 from "../src/api/world-service.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Venue planning shows anonymous six-week venue contention in four bounded queries",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="territory-"+randomUUID(),player="promoter-"+randomUUID();
 const pool=postgresPool(url!,4),promotionId="promotion-0";
 try{
  await importOriginalGenesis(pool.pool,originalGenesisFixture(world));
  await joinWorld(pool.pool,{worldId:world,playerId:player,requestId:"join",expectedRevision:0});
  await submitPromotionClaim(pool.pool,{worldId:world,playerId:player,
   promotionId,requestId:"claim",expectedRevision:1});
  // Two rival promotions provisionally plan the same building and day.
  // Only anonymous aggregate interest can leave the controlled Planner.
  await withWorldTransaction(pool.pool,tx=>tx.query(
   "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,"+
   "status,show_day,venue_id) VALUES "+
   "($1,'rival-1','promotion-1',1,1,'DRAFT',5,'venue-0'),"+
   "($1,'rival-2','promotion-2',1,1,'DRAFT',5,'venue-0'),"+
   "($1,'rival-3','promotion-3',1,2,'DRAFT',6,'venue-4')",
   [world]));
  const meter=new MeasuredQuerySession("rival-territory-planner");
  const measured:TransactionPool={async connect(){
   const client=await pool.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,args:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,args));
    }};
  }};
  const scope={worldId:world,promotionId,playerId:player};
  const view=await readSixWeekPlanner(measured,scope);
  const budget=meter.assertBudget({maxQueries:4,maxResultBytes:24000});
  assert.equal(budget.queryCount,4);
  assert.deepEqual(view.venuePressure,[
   {year:1,week:1,day:5,venueId:"venue-0",otherPromotions:2},
   {year:1,week:2,day:6,venueId:"venue-4",otherPromotions:1}
  ]);
  assert.equal(view.weeks.length,7);
   assert.equal(view.weeks[6]?.week,7);
  assert.equal(view.homeMarketId,"market-0");
  const home=view.venues.find(x=>x.home);
  assert.ok(home);
  assert.equal(home.marketName,"Territory 0");
  assert.equal(home.audiencePotential,65);
  assert.equal(home.wrestlingInterest,70);
  assert.equal(home.spendingIndex,90);
  assert.equal(home.liveStrength,50);
  assert.equal(home.prestige,55);
  assert.equal(home.productionSuitability,80);
  assert.deepEqual(home.strongestRival,{name:"Promotion 7",tier:"INDEPENDENT",
   liveStrength:57,basedHere:false});
  assert.equal(view.venues.filter(x=>x.marketId==="market-0").length,4);
  await assert.rejects(readSixWeekPlanner(pool.pool,{...scope,playerId:"impostor"}),/access denied/i);
 }finally{
  await withWorldTransaction(pool.pool,async tx=>{
   for(const table of ["ppw_booking_drafts","ppw_contract_offers","ppw_contract_renewal_proposals",
    "ppw_contract_date_requests","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_championships","ppw_people","ppw_venues",
    "ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>pool.close());
 }
});

/** Real commands in an isolated PostgreSQL World with two authenticated players.
 * All seven booking weeks are exercised; no live World is read or advanced.
 */
test("two human managers retain separate current + six future weeks, protected cards and venues",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="advance-seven-"+randomUUID(),db=postgresPool(url!,4);
 const players=["owner-a-"+randomUUID(),"owner-b-"+randomUUID()];
 const promotions=["promotion-0","promotion-1"];
 const scopes=promotions.map((promotionId,i)=>({
  worldId:world,promotionId,playerId:players[i]!
 }));
 let revision=0;
 const checked=(status:string)=>{assert.equal(status,"APPLIED");revision++;};
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,64));
  checked((await joinWorld(db.pool,{worldId:world,playerId:players[0]!,
   requestId:"join-a",expectedRevision:revision})).status);
  checked((await submitPromotionClaim(db.pool,{...scopes[0]!,
   requestId:"claim-a",expectedRevision:revision})).status);
  checked((await joinWorld(db.pool,{worldId:world,playerId:players[1]!,
   requestId:"join-b",expectedRevision:revision})).status);
  checked((await submitPromotionClaim(db.pool,{...scopes[1]!,
   requestId:"claim-b",expectedRevision:revision})).status);
  const venues=await Promise.all(scopes.map(scope=>readSixWeekPlanner(db.pool,scope)));
  assert.ok(venues.every(v=>v.weeks.length===7&&v.weeks[6]!.week===7));
  const home=venues.map(v=>v.venues.find(x=>x.home)!);
  assert.ok(home.every(v=>v&&v.venueId&&v.marketId));
  const showIds=[new Map<number,string>(),new Map<number,string>()];
  for(let week=1;week<=7;week++){
   for(let i=0;i<2;i++){
    const reply=await planShowWeek(db.pool,{...scopes[i]!,
     requestId:"plan-"+i+"-"+week,expectedRevision:revision,
     year:1,week,eventType:"REGULAR",day:5,
     marketId:home[i]!.marketId,venueId:home[i]!.venueId,
     ticketStrategy:"STANDARD"});
    checked(reply.status);
    showIds[i]!.set(week,reply.result.draftId);
   }
  }
  const a=await readSixWeekPlanner(db.pool,scopes[0]!);
  const b=await readSixWeekPlanner(db.pool,scopes[1]!);
  assert.deepEqual(a.weeks.map(w=>w.shows.length),Array(7).fill(1));
  assert.deepEqual(b.weeks.map(w=>w.shows.length),Array(7).fill(1));
  assert.ok(a.weeks.every(w=>w.canEdit));
  assert.ok(b.weeks.every(w=>w.canEdit));
  assert.ok(a.weeks.every((w,i)=>w.shows[0]!.draftId===showIds[0]!.get(i+1)));
  assert.ok(b.weeks.every((w,i)=>w.shows[0]!.draftId===showIds[1]!.get(i+1)));
  assert.ok(!a.weeks.some(w=>w.shows.some(s=>showIds[1]!.get(w.week)===s.draftId)));
  const cast=[
   [{personId:"person-8",contractId:"contract-8"},
    {personId:"person-32",contractId:"contract-32"}],
   [{personId:"person-1",contractId:"contract-1"},
    {personId:"person-17",contractId:"contract-17"}]
  ];
  for(let i=0;i<2;i++){
   const members=cast[i]!;
   const payload={matchType:"SINGLES",family:"INDIVIDUAL",
    sides:[{sideId:"A",participants:[members[0]!]},{sideId:"B",participants:[members[1]!]}],
    participants:members,scriptedWinnerSide:i===0?"A":"B",
    plannedFinish:"CLEAN_PIN",intent:"COMPETITIVE",plannedLengthMinutes:16};
   for(const week of [1,7]){
    const showId=showIds[i]!.get(week)!;
    const ctx={pool:db.pool,actor:{playerId:players[i]!}};
    const saved=await saveCardEditorAsActor(ctx,{
     worldId:world,promotionId:promotions[i]!,showId,
     requestId:"card-"+i+"-"+week,expectedRevision:revision,
     matches:[{slotId:"match",payload}],runningOrder:["match"]});
    checked(saved.status);
    const inspected=await showCardEditorAsActor(ctx,world,promotions[i]!,showId);
    assert.equal(inspected.canEdit,true);
    assert.equal(inspected.slots.length,1);
    assert.equal((inspected.slots[0]!.payload as {scriptedWinnerSide:string}).scriptedWinnerSide,
     i===0?"A":"B");
    const ready=await markPreparedShowReadyAsActor(ctx,{
     worldId:world,promotionId:promotions[i]!,showId,confirmReadyToRun:true,
     requestId:"ready-"+i+"-"+week,expectedRevision:revision});
    checked(ready.status);
    assert.equal((await showCardEditorAsActor(ctx,world,promotions[i]!,showId)).ready,true);
   }
  }
  // A manager cannot open or alter the other manager's card, even by ID.
  await assert.rejects(showCardEditorAsActor({
   pool:db.pool,actor:{playerId:players[0]!}},world,promotions[1]!,
   showIds[1]!.get(7)!),/not accessible|denied/i);
  const otherVenue=venues[0]!.venues.find(v=>v.marketId===home[0]!.marketId&&
   v.venueId!==home[0]!.venueId)!;
  assert.ok(otherVenue);
  const rescheduled=await planShowWeek(db.pool,{...scopes[0]!,
   requestId:"move-week-seven",expectedRevision:revision,year:1,week:7,
   eventType:"REGULAR",draftId:showIds[0]!.get(7)!,day:6,
   marketId:otherVenue.marketId,venueId:otherVenue.venueId,
   ticketStrategy:"STANDARD"});
  checked(rescheduled.status);
  const moved=await showCardEditorAsActor({
   pool:db.pool,actor:{playerId:players[0]!}},world,promotions[0]!,
   showIds[0]!.get(7)!);
  assert.equal(moved.day,6);
  assert.equal(moved.venueId,otherVenue.venueId);
  assert.equal(moved.slots.length,1,"A future card survives a venue edit");
  assert.equal(moved.ready,false,"Changed logistics require renewed submission");
  const stillReady=await showCardEditorAsActor({
   pool:db.pool,actor:{playerId:players[1]!}},world,promotions[1]!,
   showIds[1]!.get(7)!);
  assert.equal(stillReady.ready,true,"Manager B's submission is untouched");
  // Simulate the clock boundary *inside this disposable fixture* to assert
  // future cards persist on the new planning horizon; certified progression
  // and result publication have separate two-human end-to-end tests.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=2 WHERE world_id=$1",[world]));
  for(let i=0;i<2;i++){
   const after=await readSixWeekPlanner(db.pool,scopes[i]!);
   assert.equal(after.weeks[0]!.week,2);
   assert.equal(after.weeks[5]!.shows[0]!.draftId,showIds[i]!.get(7));
   assert.equal(after.weeks[5]!.shows[0]!.slots,1);
   assert.equal(after.weeks[5]!.shows[0]!.ready,i===1);
  }
  // A future week beyond the new six-week window is rejected without writes.
  await assert.rejects(planShowWeek(db.pool,{...scopes[0]!,
   requestId:"too-far",expectedRevision:revision,year:1,week:9,
   eventType:"REGULAR",day:5,venueId:home[0]!.venueId,
   marketId:home[0]!.marketId,ticketStrategy:"STANDARD"}),/next six weeks/i);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_card_slots","ppw_booking_drafts","ppw_contract_offers",
    "ppw_contract_renewal_proposals","ppw_contract_date_requests",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_contracts","ppw_championships",
    "ppw_people","ppw_venues","ppw_promotion_market_states",
    "ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[players]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
