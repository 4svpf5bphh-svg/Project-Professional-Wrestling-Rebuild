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
  const logout=await handlePpwHostApi(request("/api/auth","DELETE",
   undefined,cookie1,csrf1));
  assert.equal(logout.status,200);
  assert.match(logout.headers.get("set-cookie")!,/Max-Age=0/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[p1,p2]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
