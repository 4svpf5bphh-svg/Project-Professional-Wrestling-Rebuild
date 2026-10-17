import test from "node:test";
import assert from "node:assert/strict";
import {createCardClient} from "../src/web/card-client.js";
const scope={worldId:"world",promotionId:"promotion",showId:"show",csrfToken:"session-token"};
test("booking save and results attach CSRF without user-controlled actor",async()=>{
 const seen:{url:string;request:RequestInit}[]=[];
 const fake=(async(url:RequestInfo|URL,request?:RequestInit)=>{
  seen.push({url:String(url),request:request!});
  return new Response(JSON.stringify({ok:true}),{
   status:200,headers:{"content-type":"application/json"}});
 }) as typeof fetch;
 const client=createCardClient(scope,fake);
 await client("save",{requestId:"new-card",expectedRevision:0,
  matches:[],segments:[],runningOrder:[]});
 await client("results");
 assert.equal(seen.length,2);
 assert.ok(seen.every(s=>s.url==="/api/card"&&
  (s.request.headers as Record<string,string>)["x-ppw-csrf"]==="session-token"&&
  s.request.credentials==="same-origin"));
 const body=JSON.parse(String(seen[0]!.request.body));
 assert.equal(body.method,"save");
 assert.deepEqual(body.segments,[]);
 assert.equal(body.playerId,undefined);
 assert.equal(body.csrfToken,undefined);
});
test("unverified host cannot create booking bridge and bad actions are blocked",async()=>{
 assert.throws(()=>createCardClient({...scope,csrfToken:""}),/Authenticated/);
 const client=createCardClient(scope,async()=>{throw Error("Network should not be reached");});
 await assert.rejects(client("advanceWorld"),/Unknown card action/);
});
test("Staff settings are submitted with actorless CSRF-protected browser identity",async()=>{
 const seen:Record<string,unknown>[]=[];
 const client=createCardClient({...scope,showId:""},async(_url,init)=>{
  const p=JSON.parse(String(init?.body)) as Record<string,unknown>;
  seen.push(p);
  return new Response(JSON.stringify({status:"APPLIED"}),{status:200});
 });
 await client("staff");
 await client("setStaffContinuity",{requestId:"staff-choice",expectedRevision:2,
  allowUnfinishedFallback:true,allowLogisticsFallback:true,
  autoRenewSameTerms:true,
  permittedDays:[2,5],permittedVenueIds:["venue-1"]});
 assert.deepEqual(seen.map(p=>p.method),["staff","setStaffContinuity"]);
 assert.ok(seen.every(p=>p.playerId===undefined));
 assert.deepEqual(seen[1]!.permittedDays,[2,5]);
 assert.equal(seen[1]!.autoRenewSameTerms,true);
});
test("Global Industry view is a private authenticated session read, not a rival draft fetch",async()=>{
 const bodies:Record<string,unknown>[]=[];
 const client=createCardClient({...scope,showId:""},async(_url,init)=>{
  bodies.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({worldName:"Public World"}),{status:200});
 });
 await client("industry");
 assert.equal(bodies[0]!.method,"industry");
 assert.equal(bodies[0]!.playerId,undefined);
 assert.equal(bodies[0]!.showId,"");
});
test("Promotion-wide routes do not depend on a show draft",async()=>{
 const seen:string[]=[];
 const client=createCardClient({...scope,showId:""},async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  seen.push(body.method);
  return new Response(JSON.stringify({}),{status:200});
 });
 for(const method of ["overview","programmes","tagTeams","stables",
  "persona","resultsArchive","business","staff","industry","planner","calendar"])
  await client(method);
 assert.equal(seen.length,11);
 await assert.rejects(client("results"),/booked show/);
});
test("a rejected session returns a user-visible error",async()=>{
 const client=createCardClient(scope,async()=>new Response("",{status:403}));
 await assert.rejects(client("results"),/session expired/i);
});

test("programme desk works through verified browser boundary",async()=>{
 const events:string[]=[];
 const client=createCardClient(scope,async(_url,init)=>{
  events.push(JSON.parse(String(init?.body)).method);
  return new Response(JSON.stringify({status:"APPLIED"}),{status:200});
 });
 await client("programmes");
 await client("startProgramme",{requestId:"a",expectedRevision:2,sideA:[],sideB:[]});
 await client("endProgramme",{requestId:"b",expectedRevision:3,programmeId:"p"});
 assert.deepEqual(events,["programmes","startProgramme","endProgramme"]);
});

test("verified browser sessions can open global wrestler working connections read-only",async()=>{
 const recorded:string[]=[];
 const client=createCardClient(scope,async(_url,options)=>{
  const body=JSON.parse(String(options?.body));
  recorded.push(body.method+":"+body.personId);
  assert.equal(body.playerId,undefined);
  return new Response(JSON.stringify({roster:[],connections:[]}),{status:200});
 });
 await client("workingConnections",{personId:"wrestler-1"});
 assert.deepEqual(recorded,["workingConnections:wrestler-1"]);
});

test("Backstage messenger and Results archive actions reach the authenticated endpoint",async()=>{
 const actions:string[]=[];
 const client=createCardClient(scope,async(_url,init)=>{
  const p=JSON.parse(String(init?.body));
  actions.push(p.method);
  assert.equal(p.playerId,undefined);
  assert.equal((init?.headers as Record<string,string>)["x-ppw-csrf"],scope.csrfToken);
  return new Response(JSON.stringify({ok:true}),{status:200});
 });
 await client("backstage");
 await client("markBackstageRead",{personId:"w"});
 await client("backstageArchive",{personId:"w",archived:true});
 await client("backstageDecision",{conversationId:"c",decision:"NOT_NOW",
  requestId:"id",expectedRevision:5});
 await client("resultsArchive",{cursor:null});
 assert.deepEqual(actions,["backstage","markBackstageRead","backstageArchive",
  "backstageDecision","resultsArchive"]);
});

test("championship directory and paged lineage use signed browser session only",async()=>{
 const actions:Record<string,unknown>[]=[];
 const client=createCardClient(scope,async(_url,init)=>{
  const data=JSON.parse(String(init?.body)) as Record<string,unknown>;
  actions.push(data);
  assert.equal(data.playerId,undefined);
  assert.equal((init?.headers as Record<string,string>)["x-ppw-csrf"],scope.csrfToken);
  return new Response(JSON.stringify({ok:true}),{status:200});
 });
 await client("championships");
 await client("championshipHistory",{
  titlePromotionId:"other-promotion",championshipId:"belt",
  cursor:{startWeekIndex:33,reignId:"old-reign"}
 });
 assert.deepEqual(actions.map(x=>x.method),["championships","championshipHistory"]);
 assert.equal(actions[1]!.promotionId,"promotion","Viewer ownership is scoped to session");
 assert.equal(actions[1]!.titlePromotionId,"other-promotion");
});

test("World tag team roster and new pairing use authenticated browser path",async()=>{
 const seen:string[]=[];
 const call=createCardClient(scope,async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  seen.push(body.method);
  assert.equal(body.playerId,undefined);
  return new Response(JSON.stringify({ok:true}),{status:200});
 });
 await call("tagTeams");
 await call("createTagTeam",{requestId:"team-created",
  expectedRevision:7,name:"New Blood",personIds:["w-1","w-2"]});
 await call("renameTagTeam",{requestId:"team-name",expectedRevision:8,
  teamId:"tag-team",name:"A Better Name"});
 assert.deepEqual(seen,["tagTeams","createTagTeam","renameTagTeam"]);
});

test("contract desk reads and actions use the verified manager and same CSRF transport",async()=>{
 const calls:Record<string,unknown>[]=[];
 const client=createCardClient(scope,async(_url,init)=>{
  calls.push(JSON.parse(String(init?.body)));
  assert.equal((init?.headers as Record<string,string>)["x-ppw-csrf"],scope.csrfToken);
  return new Response(JSON.stringify({status:"APPLIED"}),{status:200});
 });
 await client("contracts");
 await client("requestContractDates",{requestId:"d",expectedRevision:2,
  contractId:"contract",additionalDates:4,additionalPayment:100});
 await client("cancelContractDates",{requestId:"dc",expectedRevision:3,dateRequestId:"d"});
 await client("renewContract",{requestId:"r",expectedRevision:4,contractId:"contract"});
 await client("withdrawContractRenewal",{requestId:"rc",expectedRevision:5,proposalId:"r"});
 await client("withdrawContractOffer",{requestId:"oc",expectedRevision:6,offerId:"o"});
 assert.deepEqual(calls.map(c=>c.method),["contracts","requestContractDates",
  "cancelContractDates","renewContract","withdrawContractRenewal","withdrawContractOffer"]);
 assert.ok(calls.every(c=>c.playerId===undefined&&c.promotionId==="promotion"));
});


test("Roster and market can load without a drafted show, but match editing cannot",async()=>{
 const seen:Record<string,unknown>[]=[];
 const client=createCardClient({...scope,showId:""},async(_url,init)=>{
  seen.push(JSON.parse(String(init?.body)));
  return new Response(JSON.stringify({status:"APPLIED"}),{status:200});
 });
 await client("wrestlerDirectory",{filter:{view:"MARKET",limit:25}});
 await client("submitContractOffer",{personId:"w-1",requestId:"recruit",
  expectedRevision:4,terms:{family:"ONE_OFF",roleExpectation:"REGULAR",
   creativeControl:"NONE",startWeekIndex:0,termWeeks:1,dateEntitlement:1,
   weeklyGuarantee:0,appearanceFee:5000,signingBonus:0}});
 await client("contracts");
 assert.deepEqual(seen.map(x=>x.method),[
  "wrestlerDirectory","submitContractOffer","contracts"]);
 assert.ok(seen.every(x=>x.showId===""&&x.playerId===undefined));
 await assert.rejects(client("save",{matches:[]}),/booked show/);
 await assert.rejects(client("results"),/booked show/);
});
