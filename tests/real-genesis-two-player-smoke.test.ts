/** A disposable-CI-only, genuine original-main two-human player journey.
 * This is NOT a database tool for production or a World advance/scheduler.
 * It runs after importing one authentic fresh 643-person World in PostgreSQL.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {handlePpwHostApi} from "../src/web/ppw-host-api.js";
import {inviteDigest} from "../src/web/invite-session.js";

const enabled=process.env.CI==="true"&&
 process.env.PPW_REAL_WORLD_SMOKE_AUTHORIZED==="YES"&&
 !!process.env.SOURCE_FILE&&!!process.env.PPW_PLAYTEST_DB_URL;
test("authentic original-main Genesis: two humans independently claim fictional companies and use live mobile workspaces",{
 skip:!enabled?"Requires explicitly authorised disposable CI Genesis":false
},async()=>{
 const dsn=new URL(process.env.PPW_PLAYTEST_DB_URL!);
 if(!["localhost","127.0.0.1"].includes(dsn.hostname))
  throw new Error("Real Genesis multiplayer smoke is restricted to local disposable PostgreSQL");
 const source=JSON.parse(readFileSync(process.env.SOURCE_FILE!,"utf8")) as {
  world:{id:string};promotions:Array<{
   id:string;identity:{origin:"REAL_WORLD"|"FICTIONAL"};
   playerTakeoverEligibility:"STANDARD"|"LOCKED"
  }>
 };
 const worldId=source.world.id;
 assert.equal(source.promotions.length,13);
 const permitted=new Set(source.promotions.filter(p=>
  p.identity.origin==="FICTIONAL"&&p.playerTakeoverEligibility==="STANDARD")
  .map(p=>p.id));
 const reserved=new Set(source.promotions.filter(p=>
  p.identity.origin==="REAL_WORLD").map(p=>p.id));
 assert.equal(permitted.size,5);assert.equal(reserved.size,8);
 const identities=[randomUUID(),randomUUID()].map(v=>"playtest-manager-"+v);
 const passwords=identities.map((_,i)=>"disposable-access-"+i+"-"+randomUUID());
 process.env.DATABASE_URL=process.env.PPW_PLAYTEST_DB_URL!;
 process.env.PPW_WORLD_ID=worldId;
 process.env.PPW_SESSION_SECRET=randomUUID()+randomUUID()+randomUUID();
 process.env.PPW_PLAYER_ACCESS_HASHES=JSON.stringify(Object.fromEntries(
  identities.map((id,i)=>[id,inviteDigest(passwords[i]!)])));
 const origin="https://ppw-ci.example";
 const request=(path:string,method:"POST"|"GET",body:unknown,
  cookie="",csrf="")=>new Request(origin+path,{
   method,headers:{"host":"ppw-ci.example",
    ...(body!==null?{"content-type":"application/json"}:{}),
    ...(method==="POST"?{"origin":origin}:{}),
    ...(cookie?{"cookie":cookie}:{}),
    ...(csrf?{"x-ppw-csrf":csrf}:{})},
   ...(body!==null?{body:JSON.stringify(body)}:{})
  });
 const send=async(path:string,method:"POST"|"GET",body:unknown,
  cookie="",csrf="")=>handlePpwHostApi(request(path,method,body,cookie,csrf));
 const managers: Array<{id:string;cookie:string;csrf:string;promotionId:string}>=[];
 for(let index=0;index<2;index++){
  const login=await send("/api/auth","POST",{
   playerId:identities[index],accessCode:passwords[index]});
  assert.equal(login.status,200,"Authentic invite sign-in succeeds");
  const cookie=login.headers.get("set-cookie")!.split(";")[0]!;
  const session=async()=>{
   const response=await send("/api/session","GET",null,cookie);
   assert.equal(response.status,200);
   return response.json();
  };
  let state=await session();
  assert.equal(state.overview.membership,"NONE");
  const join=await send("/api/join","POST",{
   requestId:"join-"+identities[index],
   expectedRevision:state.overview.world.revision},cookie,state.csrfToken);
  assert.equal(join.status,200);
  assert.equal((await join.json()).status,"APPLIED");
  state=await session();
  assert.equal(state.overview.membership,"ACTIVE");
  const choices=state.availablePromotions as Array<{
   id:string;homeMarketName:string|null;rosterSize:number}>;
  assert.ok(choices.length>=2-index);
  assert.ok(choices.every(c=>permitted.has(c.id)&&!reserved.has(c.id)));
  const target=choices[0]!;
  assert.ok(target.homeMarketName?.length);
  assert.ok(target.rosterSize>=0);
  const claim=await send("/api/claim","POST",{
   requestId:"claim-"+identities[index],
   promotionId:target.id,
   expectedRevision:state.overview.world.revision},cookie,state.csrfToken);
  assert.equal(claim.status,200);
  assert.equal((await claim.json()).status,"APPLIED");
  state=await session();
  assert.equal(state.overview.promotion.id,target.id);
  assert.equal(state.overview.world.week,1);
  managers.push({id:identities[index]!,cookie,csrf:state.csrfToken,
   promotionId:target.id});
  const planner=await send("/api/card","POST",{
   method:"planner",worldId,promotionId:target.id,showId:""
  },cookie,state.csrfToken);
  assert.equal(planner.status,200,"Real calendar planner must open for each manager");
  const data=await planner.json();
  assert.equal(data.promotionId,target.id);
  assert.equal(data.weeks.length,6);
 }
 assert.notEqual(managers[0]!.promotionId,managers[1]!.promotionId);
 const owner=managers[0]!,other=managers[1]!;
 const illicit=await send("/api/card","POST",{
  method:"business",worldId,promotionId:other.promotionId,showId:""
 },owner.cookie,owner.csrf);
 assert.equal(illicit.status,400,"No cross-player financial access");
 const visible=await send("/api/card","POST",{
  method:"business",worldId,promotionId:owner.promotionId,showId:""
 },owner.cookie,owner.csrf);
 assert.equal(visible.status,200);
 console.log(JSON.stringify({status:"AUTHENTIC_TWO_MANAGER_PREVIEW_SMOKE_PASSED",
  realPromotionPopulation:reserved.size,claimablePopulation:permitted.size,
  distinctClaimed:2,worldWeek:1}));
});
