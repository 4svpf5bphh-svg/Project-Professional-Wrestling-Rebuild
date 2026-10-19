import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {handlePpwHostApi} from "../src/web/ppw-host-api.js";
import {inviteDigest} from "../src/web/invite-session.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {driveWorldResolution} from "../src/db/world-resolution-pipeline.js";
const database=process.env.PPW_NEON_TEST_URL;
const origin="https://ppw.example";
const request=(path:string,method:string,body?:Record<string,unknown>,
 cookie="",csrf="")=>new Request(origin+path,{
 method,headers:{"host":"ppw.example",...(method!=="GET"?{"origin":origin}:{}),
  ...(body?{"content-type":"application/json"}:{}),
  ...(cookie?{"cookie":cookie}:{}),
  ...(csrf?{"x-ppw-csrf":csrf}:{})},
 body:body?JSON.stringify(body):undefined
});
const post=(path:string,body:Record<string,unknown>,cookie="",csrf="")=>
 handlePpwHostApi(request(path,"POST",body,cookie,csrf));
test("End-to-end host: two signed players, one World, independent claims and private cards",{
 skip:!database?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),world="host-world-"+suffix,
  p1="player-a-"+suffix,p2="player-b-"+suffix,
  promoA="promo-a-"+suffix,promoB="promo-b-"+suffix;
 const secret1="test-player-one-"+suffix+"-high-entropy-access";
 const secret2="test-player-two-"+suffix+"-high-entropy-access";
 const db=postgresPool(database!,3);
 // Only this isolated test process uses the host's environment.
 process.env.DATABASE_URL=database;
 process.env.PPW_WORLD_ID=world;
 process.env.PPW_SESSION_SECRET="a"+randomUUID()+"b"+randomUUID();
 process.env.PPW_PLAYER_ACCESS_HASHES=JSON.stringify({
  [p1]:inviteDigest(secret1),[p2]:inviteDigest(secret2)
 });
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Two Managers",seed:77,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promoA,name:"First Company",tier:"LOCAL"});
   await addPromotion(tx,world,{id:promoB,name:"Second Company",tier:"LOCAL"});
   await tx.query("UPDATE ppw_worlds SET injury_rate_multiplier=0 WHERE world_id=$1",[world]);
   await tx.query("UPDATE ppw_promotions SET media_reach=70 WHERE world_id=$1",[world]);
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',60,70,100)",[world]);
   for(const venue of ["arena-a","arena-b"])
    await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,$2,$3,'home')",[world,venue,venue]);
   for(let i=0;i<4;i++){
    const person="wrestler-"+i;
    await tx.query(
     "INSERT INTO ppw_people(world_id,person_id,name,booking_division,in_ring_quality,match_craft,presentation,stamina,safety,fatigue,wear,popularity,recognition,momentum,default_alignment) VALUES($1,$2,$3,'MEN',80,80,75,85,95,5,5,65,65,70,'FACE')",
     [world,person,"Wrestler "+i]);
    await tx.query(
     "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
     [world,"deal-"+i,person,i<2?promoA:promoB]);
   }
   for(const [show,promo,venue,day] of [
    ["show-a",promoA,"arena-a",3],["show-b",promoB,"arena-b",5]
   ] as const){
    await tx.query(
     "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id)"+
     " VALUES($1,$2,$3,1,1,'DRAFT',$4,$5,'home')",[world,show,promo,day,venue]);
   }
  });
  const invalid=await post("/api/auth",{playerId:p1,accessCode:secret2});
  assert.equal(invalid.status,401);
  const login1=await post("/api/auth",{playerId:p1,accessCode:secret1});
  assert.equal(login1.status,200);
  const login2=await post("/api/auth",{playerId:p2,accessCode:secret2});
  assert.equal(login2.status,200);
  const cookie1=login1.headers.get("set-cookie")!.split(";")[0]!;
  const cookie2=login2.headers.get("set-cookie")!.split(";")[0]!;
  assert.notEqual(cookie1,cookie2);
  assert.equal((await handlePpwHostApi(request("/api/session","GET"))).status,401);
  const initial1=await handlePpwHostApi(request("/api/session","GET",undefined,cookie1));
  assert.equal(initial1.status,200);
  const s1=await initial1.json();
  assert.equal(s1.playerId,p1);assert.equal(s1.overview.membership,"NONE");
  assert.equal(s1.overview.promotion,null);
  const csrf1=s1.csrfToken as string;
  const csrf2=(await (await handlePpwHostApi(request("/api/session","GET",
   undefined,cookie2))).json()).csrfToken as string;
  const spoof=await handlePpwHostApi(request("/api/join","POST",{
   requestId:"join1",expectedRevision:0,playerId:p2
  },cookie1,"wrong"));
  assert.equal(spoof.status,403);
  assert.equal((await post("/api/join",{requestId:"join1",expectedRevision:0,
   playerId:p2},cookie1,csrf1)).status,200);
  const beforeClaim=await (await handlePpwHostApi(request("/api/session","GET",
   undefined,cookie1))).json();
  assert.equal(beforeClaim.overview.membership,"ACTIVE");
  assert.equal(beforeClaim.availablePromotions.length,2);
  assert.equal((await post("/api/claim",{requestId:"claim1",expectedRevision:1,
   promotionId:promoA,playerId:p2},cookie1,csrf1)).status,200);
  assert.equal((await post("/api/join",{requestId:"join2",expectedRevision:2},
   cookie2,csrf2)).status,200);
  assert.equal((await post("/api/claim",{requestId:"claim2",expectedRevision:3,
   promotionId:promoB},cookie2,csrf2)).status,200);
  const a=await (await handlePpwHostApi(request("/api/session","GET",
   undefined,cookie1))).json();
  const b=await (await handlePpwHostApi(request("/api/session","GET",
   undefined,cookie2))).json();
  assert.equal(a.overview.promotion.id,promoA);
  assert.equal(b.overview.promotion.id,promoB);
  const ownCard=await post("/api/card",{method:"overview",
   worldId:world,promotionId:promoA,showId:"",playerId:p2},cookie1,csrf1);
  assert.equal(ownCard.status,200);
  assert.equal((await ownCard.json()).promotion.id,promoA);
  const denied=await post("/api/card",{method:"business",
   worldId:world,promotionId:promoB,showId:"",playerId:p2},cookie1,csrf1);
  assert.equal(denied.status,400,"Player one must not read player two's private finances");
  assert.equal((await post("/api/claim",{requestId:"steal",
   expectedRevision:4,promotionId:promoB},cookie1,csrf1)).status,200);
  // Command result is REJECTED, not silently transferred.
  const final=await (await handlePpwHostApi(request("/api/session","GET",
   undefined,cookie1))).json();
  assert.equal(final.overview.promotion.id,promoA);
  // The same two independently authenticated managers can now create and
  // confirm separate real show cards; neither can access the other's draft.
  const makeMatch=(first:number,second:number)=>({
   matchType:"SINGLES",family:"INDIVIDUAL",
   participants:[{personId:"wrestler-"+first,contractId:"deal-"+first},
    {personId:"wrestler-"+second,contractId:"deal-"+second}],
   sides:[
    {sideId:"A",participants:[{personId:"wrestler-"+first,contractId:"deal-"+first}]},
    {sideId:"B",participants:[{personId:"wrestler-"+second,contractId:"deal-"+second}]}
   ],scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:18
  });
  const card=(promo:string,show:string,match:ReturnType<typeof makeMatch>,
   rev:number,key:string,cookie:string,csrf:string)=>post("/api/card",{
   method:"save",worldId:world,promotionId:promo,showId:show,
   requestId:key,expectedRevision:rev,
   matches:[{slotId:"main",payload:match}],segments:[],runningOrder:["main"]
  },cookie,csrf);
  const revision=Number(final.overview.world.revision);
  const bookedA=await card(promoA,"show-a",makeMatch(0,1),
   revision,"book-a",cookie1,csrf1);
  assert.equal(bookedA.status,200);
  assert.equal((await bookedA.json()).status,"APPLIED");
  const bookedB=await card(promoB,"show-b",makeMatch(2,3),
   revision+1,"book-b",cookie2,csrf2);
  assert.equal(bookedB.status,200);
  assert.equal((await bookedB.json()).status,"APPLIED");
  assert.equal((await post("/api/card",{method:"load",worldId:world,
   promotionId:promoB,showId:"show-b"},cookie1,csrf1)).status,400);
  const ownA=await post("/api/card",{method:"load",worldId:world,
   promotionId:promoA,showId:"show-a"},cookie1,csrf1);
  assert.equal(ownA.status,200);
  assert.equal((await ownA.json()).slots[0].payload.scriptedWinnerSide,"A");
  for(const [promo,show,cookie,csrf,rev,key] of [
   [promoA,"show-a",cookie1,csrf1,revision+2,"ready-a"],
   [promoB,"show-b",cookie2,csrf2,revision+3,"ready-b"]
  ] as const){
   const ready=await post("/api/card",{method:"ready",worldId:world,
    promotionId:promo,showId:show,requestId:key,
    expectedRevision:rev},cookie,csrf);
   assert.equal(ready.status,200);
   assert.equal((await ready.json()).status,"APPLIED");
  }
  const prepared=await withWorldTransaction(db.pool,tx=>tx.query<{
   draft_id:string;lock_ready_fingerprint:string|null}>(
   "SELECT draft_id,lock_ready_fingerprint FROM ppw_booking_drafts"+
   " WHERE world_id=$1 ORDER BY draft_id",[world]));
  assert.equal(prepared.length,2);
  assert.ok(prepared.every(x=>!!x.lock_ready_fingerprint));
  // The single World Lock hands off both separately authorised bookings.
  // This test uses only its disposable PostgreSQL World, never a live clock.
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
   [world]));
  const worldState=await withWorldTransaction(db.pool,tx=>tx.query<{
   revision:number|string}>("SELECT revision FROM ppw_worlds WHERE world_id=$1",[world]));
  assert.equal((await lockWorldWeek(db.pool,{worldId:world,
   requestId:"host-journey-lock",expectedRevision:Number(worldState[0]!.revision)})).status,"APPLIED");
  const resolution=await driveWorldResolution(db.pool,{
   worldId:world,resolutionId:"host-journey-resolution",maxStages:16});
  assert.equal(resolution.status,"PUBLISHED",
   "Two confirmed human shows must settle without the booking UI picking any winners");
  const next=await (await handlePpwHostApi(request("/api/session","GET",
   undefined,cookie1))).json();
  assert.equal(next.overview.world.week,2);
  assert.equal(next.overview.world.phase,"OPEN");
  for(const [promotion,show,cookie,csrf] of [
   [promoA,"show-a",cookie1,csrf1],[promoB,"show-b",cookie2,csrf2]
  ] as const){
   const result=await post("/api/card",{method:"results",worldId:world,
    promotionId:promotion,showId:show},cookie,csrf);
   assert.equal(result.status,200);
   const resultBody=await result.json();
   assert.equal(resultBody.matchCount,1);
   assert.equal(resultBody.entries.filter((entry:{type:string})=>entry.type==="MATCH").length,1);
   assert.deepEqual(resultBody.entries.find((entry:{type:string})=>entry.type==="MATCH")
    ?.matchContext?.winnerNames,["Wrestler "+(promotion===promoA?0:2)],
    "The resolved broadcast must name the booked winner, with no outcome reroll");
   const archive=await post("/api/card",{method:"resultsArchive",worldId:world,
    promotionId:promotion,showId:""},cookie,csrf);
   assert.equal(archive.status,200);
   assert.equal((await archive.json()).items.length,1);
  }
  assert.equal((await post("/api/card",{method:"results",worldId:world,
   promotionId:promoB,showId:"show-b"},cookie1,csrf1)).status,400,
   "Published results remain scoped to the owning human promotion");
  const dates=await withWorldTransaction(db.pool,tx=>tx.query<{
   remaining_dates:number}>(
   "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",
   [world]));
  assert.deepEqual(dates.map(x=>x.remaining_dates),[4,4,4,4],
   "A real completed appearance must consume exactly one booked date");
  const logout=await handlePpwHostApi(request("/api/auth","DELETE",
   undefined,cookie1,csrf1));
  assert.equal(logout.status,200);
  assert.match(logout.headers.get("set-cookie")!,/Max-Age=0/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of [
    "ppw_programme_resolved_activities","ppw_wrestler_relationship_changes",
    "ppw_tag_working_pair_appearances","ppw_wrestler_relationships",
    "ppw_completed_match_evidence","ppw_completed_show_segments",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_show_resolutions",
    "ppw_week_resolution_seals","ppw_week_resource_clearances",
    "ppw_week_prepared_finalizations","ppw_week_continuity_assessments",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_alignment_changes",
    "ppw_programme_match_activities","ppw_programme_participants",
    "ppw_programmes","ppw_card_slots","ppw_booking_drafts","ppw_contracts",
    "ppw_people","ppw_venues","ppw_markets","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[p1,p2]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
