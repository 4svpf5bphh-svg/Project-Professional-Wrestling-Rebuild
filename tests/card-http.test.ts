import {test} from "node:test";
import {strict as assert} from "node:assert";
import {handleCardHttp} from "../src/web/card-http.js";
const url="https://ppw.example/api/card";
const deps={expectedWorldId:"w",authenticate:async()=>({context:{actor:{playerId:"p"},pool:null as never},csrfToken:"token"}),
 allowRequest:async()=>true};
const request=(body:string,headers:Record<string,string>={},method="POST")=>new Request(url,{
 method,headers:{"origin":"https://ppw.example","host":"ppw.example",
 "content-type":"application/json","x-ppw-csrf":"token",...headers},body:method==="POST"?body:undefined});
test("card HTTP rejects cross-origin and missing CSRF before touching database",async()=>{
 assert.equal((await handleCardHttp(request("{}",{"origin":"https://evil.example"}),deps)).status,403);
 assert.equal((await handleCardHttp(request("{}",{"x-ppw-csrf":"wrong"}),deps)).status,403);
 assert.equal((await handleCardHttp(request("{}",{"content-type":"text/plain"}),deps)).status,415);
});
test("card HTTP bounds body and rate limits",async()=>{
 assert.equal((await handleCardHttp(request("x".repeat(131073)),deps)).status,413);
 assert.equal((await handleCardHttp(request("{}",{}),{...deps,allowRequest:async()=>false})).status,429);
 assert.equal((await handleCardHttp(request("{}",{}),{...deps,authenticate:async()=>null})).status,401);
});
test("card HTTP never accepts unverified actor or unknown method",async()=>{
 const response=await handleCardHttp(request(JSON.stringify({worldId:"w",promotionId:"p",showId:"s",method:"unknown",playerId:"forged"})),deps);
 assert.equal(response.status,400);
 assert.deepEqual(await response.json(),{error:"Booking request rejected"});
});

test("host rejects another World without dispatching to the database",async()=>{
 const response=await handleCardHttp(request(JSON.stringify({
  method:"overview",worldId:"other-world",promotionId:"p",showId:""
 })),deps);
 assert.equal(response.status,403);
 assert.deepEqual(await response.json(),{error:"World not available"});
});
