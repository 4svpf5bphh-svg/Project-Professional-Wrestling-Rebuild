import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {handlePpwHostApi} from "../src/web/ppw-host-api.js";
import {inviteDigest} from "../src/web/invite-session.js";
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
   await tx.query("INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,wrestling_interest,spending_index) VALUES($1,'home','Home',60,70,100)",[world]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,market_id) VALUES($1,'arena','Arena','home')",[world]);
   for(let i=0;i<4;i++){
    const person="wrestler-"+i;
    await tx.query(
     "INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [world,person,"Wrestler "+i]);
    await tx.query(
     "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',5,52)",
     [world,"deal-"+i,person,i<2?promoA:promoB]);
   }
   for(const [show,promo] of [["show-a",promoA],["show-b",promoB]]){
    await tx.query(
     "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id,market_id)"+
     " VALUES($1,$2,$3,1,1,'DRAFT',5,'arena','home')",[world,show,promo]);
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
  const logout=await handlePpwHostApi(request("/api/auth","DELETE",
   undefined,cookie1,csrf1));
  assert.equal(logout.status,200);
  assert.match(logout.headers.get("set-cookie")!,/Max-Age=0/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_programme_match_activities",
    "ppw_card_slots","ppw_booking_drafts","ppw_contracts",
    "ppw_people","ppw_venues","ppw_markets","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[p1,p2]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
