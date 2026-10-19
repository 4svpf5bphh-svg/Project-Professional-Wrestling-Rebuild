/** No standalone host or production database is touched.
 * CI-only challenge: real original-main 13-promotion Genesis, two independently
 * authenticated players, separate takeovers, and owner-only workspaces.
 * No bookings, World Lock, clocks, resets or scheduler are run.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {handlePpwHostApi} from "../src/web/ppw-host-api.js";
import {inviteDigest} from "../src/web/invite-session.js";
import {postgresPool} from "../src/db/postgres.js";
import {inspectPlaytestPopulation} from "../src/db/playtest-preview-readiness.js";
const origin="https://ppw-authentic-preview.invalid";
const makeRequest=(path:string,method:string,payload?:Record<string,unknown>,
 cookie="",csrf="")=>new Request(origin+path,{method,headers:{
  host:"ppw-authentic-preview.invalid",
  ...(method==="POST"?{origin}:{}),
  ...(payload?{"content-type":"application/json"}:{}),
  ...(cookie?{cookie}:{}),
  ...(csrf?{"x-ppw-csrf":csrf}:{})
 },body:payload?JSON.stringify(payload):undefined});
const post=(path:string,payload:Record<string,unknown>,cookie="",csrf="")=>
 handlePpwHostApi(makeRequest(path,"POST",payload,cookie,csrf));
async function main(){
 const dsn=process.env.PPW_NEON_TEST_URL;
 const world=process.env.PPW_CI_REAL_GENESIS_WORLD;
 if(process.env.CI!=="true"||process.env.PPW_AUTHENTIC_CI_SMOKE!=="YES"||
  !dsn||!world||!/^[a-zA-Z0-9_.:-]{1,100}$/.test(world))
  throw new Error("Only an explicitly enabled CI disposable authentic-World check is allowed");
 const url=new URL(dsn);
 if(!["localhost","127.0.0.1","::1"].includes(url.hostname)||
  url.pathname!=="/ppw_test"||url.username!=="ppw_test")
  throw new Error("CI authentic-World test requires localhost/ppw_test, never Neon or production");
 const pool=postgresPool(dsn,2);
 try{
  const first=await inspectPlaytestPopulation(pool.pool,world);
  assert.equal(first.ready,true,
   "Authentic original main must pass every preflight gate: "+first.issues.join("; "));
  assert.equal(first.counts.promotions,13);
  assert.equal(first.counts.wrestlers,643);
  assert.equal(first.counts.availableTakeovers,5);
  const id=randomUUID(),a="authentic-a-"+id,b="authentic-b-"+id;
  const aCode="first-"+randomUUID()+randomUUID();
  const bCode="second-"+randomUUID()+randomUUID();
  process.env.DATABASE_URL=dsn;
  process.env.PPW_WORLD_ID=world;
  process.env.PPW_SESSION_SECRET=randomUUID()+randomUUID();
  process.env.PPW_PLAYER_ACCESS_HASHES=JSON.stringify({
   [a]:inviteDigest(aCode),[b]:inviteDigest(bCode)
  });
  const login=async(player:string,code:string)=>{
   const response=await post("/api/auth",{playerId:player,accessCode:code});
   assert.equal(response.status,200,"An authentic independent manager can log in");
   const cookie=response.headers.get("set-cookie")?.split(";")[0];
   assert.ok(cookie,"Login must issue a server-signed cookie");
   const sessionResponse=await handlePpwHostApi(makeRequest("/api/session","GET",
    undefined,cookie));
   assert.equal(sessionResponse.status,200);
   const session=await sessionResponse.json();
   assert.equal(session.playerId,player);
   assert.equal(session.overview.promotion,null);
   assert.equal(session.overview.membership,"NONE");
   assert.equal(session.availablePromotions.length,0,
    "A player must join the World before accessing promotion choices");
   assert.ok(typeof session.csrfToken==="string");
   return {cookie,csrf:session.csrfToken as string};
  };
  assert.equal((await post("/api/auth",{playerId:a,accessCode:bCode})).status,401);
  const aSession=await login(a,aCode);
  const bSession=await login(b,bCode);
  const join=async(session:{cookie:string;csrf:string},rev:number,key:string)=>{
   const response=await post("/api/join",{requestId:key,expectedRevision:rev},
    session.cookie,session.csrf);
   assert.equal(response.status,200);
   const result=await response.json();
   assert.equal(result.status,"APPLIED");
  };
  await join(aSession,0,"join-a-"+id);
  const before=await(await handlePpwHostApi(makeRequest("/api/session","GET",
   undefined,aSession.cookie))).json();
  assert.equal(before.availablePromotions.length,5);
  assert.ok(before.availablePromotions.every((p:{name:string})=>
   !["WWE","AEW","NJPW","NXT","TNA Wrestling","STARDOM","ROH","CMLL"]
    .includes(p.name)),"Protected real promotion cannot be offered");
  const promoA=before.availablePromotions[0].id as string;
  const promoB=before.availablePromotions[1].id as string;
  assert.notEqual(promoA,promoB);
  const claim=async(session:{cookie:string;csrf:string},promotionId:string,
   rev:number,key:string)=>{
   const response=await post("/api/claim",{promotionId,requestId:key,
    expectedRevision:rev},session.cookie,session.csrf);
   assert.equal(response.status,200);
   const result=await response.json();
   assert.equal(result.status,"APPLIED");
  };
  await claim(aSession,promoA,1,"claim-a-"+id);
  await join(bSession,2,"join-b-"+id);
  await claim(bSession,promoB,3,"claim-b-"+id);
  const owned=async(session:{cookie:string;csrf:string})=>{
   const response=await handlePpwHostApi(makeRequest("/api/session","GET",
    undefined,session.cookie));
   assert.equal(response.status,200);
   return response.json();
  };
  const ownA=await owned(aSession),ownB=await owned(bSession);
  assert.equal(ownA.overview.promotion?.id,promoA);
  assert.equal(ownB.overview.promotion?.id,promoB);
  assert.ok(ownA.overview.promotion.homeMarketName,
   "Original World home territory survives into player Home");
  assert.ok(ownB.overview.promotion.homeMarketName);
  assert.equal(ownA.overview.world.week,1);
  assert.equal(ownA.overview.world.phase,"OPEN");
  const forbidden=await post("/api/card",{
   method:"business",worldId:world,promotionId:promoB,showId:"",
   playerId:b},aSession.cookie,aSession.csrf);
  assert.equal(forbidden.status,400,
   "Authenticated player cannot read another manager's actual business desk");
  const desk=await post("/api/card",{
   method:"business",worldId:world,promotionId:promoA,showId:"",
   playerId:b},aSession.cookie,aSession.csrf);
  assert.equal(desk.status,200,
   "The same authenticated owner must be able to read their real business desk");
  const second=await inspectPlaytestPopulation(pool.pool,world);
  assert.equal(second.ready,true);
  assert.equal(second.counts.controlledPromotions,2);
  assert.equal(second.counts.humanManagers,2);
  assert.equal(second.counts.availableTakeovers,3);
  console.log(JSON.stringify({status:"AUTHENTIC_TWO_MANAGER_PLAYTEST_READY",
   wrestlers:second.counts.wrestlers,women:second.counts.women,
   originalPromotions:second.counts.promotions,protectedReal:8,
   claimableAfterTwo:second.counts.availableTakeovers,
   independentManagers:second.counts.humanManagers,
   firstCompany:ownA.overview.promotion.name,
   secondCompany:ownB.overview.promotion.name,
   worldWeek:ownA.overview.world.week,worldPhase:ownA.overview.world.phase
  }));
 }finally{await pool.close();}
}
main().catch(error=>{
 console.error(error instanceof Error?error.message:"CI original-main journey failed");
 process.exitCode=1;
});
