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
