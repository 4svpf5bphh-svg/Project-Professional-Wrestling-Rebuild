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
  assert.equal(data.promotionName,state.overview.promotion.name);
  assert.equal(data.year,1);
  assert.equal(data.week,1);
  assert.ok(data.venues.length>0,"Actual venues must load in the first-week planner");
  assert.equal(data.weeks.length,6);
  const current=data.weeks[0];
  assert.equal(current.year,1);assert.equal(current.week,1);
  const normal=current.scheduled.find((x:{eventType:string})=>x.eventType==="REGULAR");
  assert.ok(normal,"Fresh independent company must have a genuine Week 1 show");
  const venue=data.venues.find((x:{home:boolean})=>x.home)??data.venues[0];
  assert.ok(venue,"New manager needs a playable venue");
  const planned=await send("/api/card","POST",{
   method:"planShow",worldId,promotionId:target.id,showId:"",
   requestId:"plan-"+identities[index],
   expectedRevision:state.overview.world.revision,
   year:1,week:1,day:3+index*2,
   marketId:venue.marketId,venueId:venue.venueId,
   ticketStrategy:"STANDARD",eventType:"REGULAR",showSeriesId:normal.seriesId
  },cookie,state.csrfToken);
  assert.equal(planned.status,200,"Each actual manager can select a show and home venue");
  const plan=await planned.json();
  assert.equal(plan.status,"APPLIED","A genuine, editable show must be created");
  const draftId=plan.result?.draftId;
  assert.ok(typeof draftId==="string");
  const currentCard=await send("/api/card","POST",{
   method:"load",worldId,promotionId:target.id,showId:draftId
  },cookie,state.csrfToken);
  assert.equal(currentCard.status,200,
   "Manager can open their own real Week 1 card editor");
  const card=await currentCard.json();
  assert.equal(card.showId,draftId);
  const bookable=await send("/api/card","POST",{
   method:"talent",worldId,promotionId:target.id,showId:draftId,search:""
  },cookie,state.csrfToken);
  assert.equal(bookable.status,200,"Shared real-roster picker must open");
  const bookableData=await bookable.json();
  assert.ok(Array.isArray(bookableData.talent));
  const eligible=bookableData.talent.filter((x:{available:boolean})=>x.available);
  assert.ok(eligible.length>=2,
   "An original independent company cannot play Week 1 without two contracted wrestlers");
  assert.ok(eligible.every((x:{personId:string;finisherMove:string|null})=>
   typeof x.personId==="string"&&!!x.finisherMove),
   "Booking picks real wrestler dossiers, including original finishers");
  const forbiddenCard=await send("/api/card","POST",{
   method:"load",worldId,promotionId:target.id,showId:draftId
  },managers[0]?.cookie??cookie,managers[0]?.csrf??state.csrfToken);
  if(index===1)assert.equal(forbiddenCard.status,400,
   "The first manager cannot open the second company's draft");
 }
 assert.notEqual(managers[0]!.promotionId,managers[1]!.promotionId);
 // Booking must also work with the actual original-main contracts, personas
 // and venue markets. No invented wrestler IDs or prepared-card fixtures.
 const prepared:string[]=[];
 for(let index=0;index<managers.length;index++){
  const manager=managers[index]!;
  const call=async(method:string,rest:Record<string,unknown>={})=>
   send("/api/card","POST",{method,worldId,
    promotionId:manager.promotionId,...rest},manager.cookie,manager.csrf);
  const auth=async()=>(await(await send("/api/session","GET",null,
   manager.cookie)).json());
  const plannerResponse=await call("planner");
  assert.equal(plannerResponse.status,200);
  const planner=await plannerResponse.json();
  const existing=planner.weeks[0]?.shows?.filter(
   (show:{status:string;bookingClass:string})=>
    show.status==="DRAFT"&&show.bookingClass==="REGULAR");
  assert.equal(existing?.length,1,
   "The existing authored show must be reused, not booked twice");
  const draftId=existing[0].draftId as string;
  assert.ok(draftId.startsWith("planner-"));
  const picker=await call("talent",{showId:draftId});
  assert.equal(picker.status,200,"Real roster picker opens on the scheduled show");
  const listing=await picker.json() as {talent:Array<{
   personId:string;contractId:string;name:string;division:string;
   available:boolean;signatureMove:string|null;finisherMove:string|null
  }>};
  const eligible=listing.talent.filter(p=>p.available);
  const pair=["MEN","WOMEN"].map(division=>
   eligible.filter(p=>p.division===division)).find(group=>group.length>=2);
  assert.ok(pair,
   "At least two available same-division original wrestlers are needed for a first show");
  const [winner,opponent]=pair!;
  assert.ok(winner!.signatureMove&&winner!.finisherMove,
   "Authentic wrestler signature and finisher must be visible in the shared booking picker");
  const competitor=(p:typeof winner)=>({personId:p!.personId,contractId:p!.contractId});
  const booked={
   matchType:"SINGLES",family:"INDIVIDUAL",
   participants:[competitor(winner),competitor(opponent)],
   sides:[{sideId:"A",participants:[competitor(winner)]},
    {sideId:"B",participants:[competitor(opponent)]}],
   scriptedWinnerSide:"A",plannedFinish:"CLEAN_PIN",
   intent:"COMPETITIVE",plannedLengthMinutes:18
  };
  const revision=(await auth()).overview.world.revision;
  const saved=await call("save",{
   showId:draftId,requestId:"real-save-"+manager.id,
   expectedRevision:revision,matches:[{slotId:"main",payload:booked}],
   segments:[],runningOrder:["main"]
  });
  assert.equal(saved.status,200,"One original main bout can be authored on the fresh rebuild");
  assert.equal((await saved.json()).status,"APPLIED");
  const reloaded=await call("load",{showId:draftId});
  assert.equal(reloaded.status,200);
  const persisted=await reloaded.json();
  assert.equal(persisted.slots?.length,1);
  assert.equal(persisted.slots[0].payload.scriptedWinnerSide,"A");
  const ready=await call("ready",{
   showId:draftId,requestId:"real-confirm-"+manager.id,
   expectedRevision:(await auth()).overview.world.revision
  });
  assert.equal(ready.status,200,
   "The actual original Wrestler booking must satisfy creative, appearance and venue readiness");
  assert.equal((await ready.json()).status,"APPLIED",
   "Only the player's explicit confirmation makes a booked show ready for the single World Lock");
  const confirmed=await call("load",{showId:draftId});
  assert.equal(confirmed.status,200);
  assert.equal((await confirmed.json()).ready,true);
  prepared.push(draftId);
 }
 const owner=managers[0]!,other=managers[1]!;
 const otherCard=await send("/api/card","POST",{
  method:"load",worldId,promotionId:other.promotionId,
  showId:prepared[1]!
 },owner.cookie,owner.csrf);
 assert.equal(otherCard.status,400,
  "An unrelated manager cannot inspect the rival's confirmed card");
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
  distinctClaimed:2,confirmedFirstShows:prepared.length,worldWeek:1}));
});
