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
