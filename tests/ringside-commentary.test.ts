import {test} from "node:test";
import assert from "node:assert/strict";
import {generateGroqReview,immutableResultDigest,ringsideResponseSchema,RingsideGenerationError} from "../src/db/ringside-commentary.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";
const show:CompletedShowView={showId:"show",year:1,week:2,crowdResponse:71,
 matchCount:1,angleCount:0,entries:[{slotId:"m",position:0,type:"MATCH",
 headline:"Omega wins",summary:"Clean pinfall",outcome:"CLEAN_PIN",
 crowdResponse:71,actorIds:["kenny"],targetIds:[],
 performerIdentities:[{personId:"kenny",ringName:"Kenny Omega",character:"Cleaner",
 style:"ALL_ROUNDER",signatureMoves:["V-Trigger"],finishingMoves:["One Winged Angel"],
 source:"WORLD_RECORD"}]}]};
const review={showHeadline:"Omega's moment",opening:"The house was ready.",
 closing:"They got a show worth remembering.",slots:[{slotId:"m",
 headline:"One Winged Angel",recap:"Omega nailed a V-Trigger and the One Winged Angel."}]};
test("Groq requires one fixed, immutable slot per booked match and validates factual copy",async()=>{
 let calls=0;const fake:typeof fetch=async (_url,init)=>{calls++;
  assert.equal((init?.headers as Record<string,string>).authorization,"Bearer fixture");
  const body=JSON.parse(String(init?.body));
  assert.equal(body.messages.length,2);
  assert.equal(body.response_format.type,"json_schema");
  assert.equal(body.response_format.json_schema.strict,true);
  assert.deepEqual(body.response_format.json_schema.schema.properties.slots.required,["card_0"]);
  assert.equal(body.response_format.json_schema.schema.properties.slots.additionalProperties,false);
  assert.equal(body.reasoning_effort,"low");
  assert.equal(body.temperature,0.92);
  assert.ok(body.max_completion_tokens>=900);
  assert.match(body.messages[0].content,/Marty Vale/);
  assert.match(body.messages[1].content,/One Winged Angel/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:review.showHeadline,opening:review.opening,closing:review.closing,
   slots:{card_0:{headline:review.slots[0].headline,recap:review.slots[0].recap}}
  })}}]}),{status:200});
 };
 assert.equal((await generateGroqReview(show,"fixture",fake)).slots[0]?.slotId,"m");
 assert.equal(calls,1);
});
test("missing card recaps, rejected factual claims and rate limits never publish output",async()=>{
 let calls=0;
 const bad:typeof fetch=async()=>{calls++;return new Response(JSON.stringify({choices:[{
  message:{content:JSON.stringify({showHeadline:review.showHeadline,opening:review.opening,
   closing:review.closing,slots:{card_0:{headline:"A headline",recap:"Kenny Omega won by submission."}}})}}]}));};
 await assert.rejects(()=>generateGroqReview(show,"fixture",bad),
  (e:unknown)=>e instanceof RingsideGenerationError&&e.code==="FACT_VALIDATION");
 assert.equal(calls,2,"Factual validation gets one quality-control retry");
 await assert.rejects(()=>generateGroqReview(show,"fixture",async()=>new Response("",{status:429})),
  (e:unknown)=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_LIMIT");
});
test("eleven-item card requires eleven output objects; no missing-angle/article drift",async()=>{
 const extended:CompletedShowView={...show,entries:Array.from({length:11},(_,i)=>({
  ...show.entries[0]!,slotId:"match-"+i,position:i
 }))};
 const schema=ringsideResponseSchema(extended) as {properties:{slots:{
  required:string[];additionalProperties:boolean}}};
 assert.equal(schema.properties.slots.required.length,11);
 assert.equal(new Set(schema.properties.slots.required).size,11);
 assert.equal(schema.properties.slots.additionalProperties,false);
 const fake:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  const fields=body.response_format.json_schema.schema.properties.slots.required as string[];
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Eleven matches",opening:"The crowd was up for it.",
   closing:"Every recorded bout got its story.",
   slots:Object.fromEntries(fields.map((key,i)=>[key,{
    headline:"A hard-fought match "+i,recap:"An even contest ended in the expected pinfall."
   }]))
  })}}]}));
 };
 const result=await generateGroqReview(extended,"fixture",fake);
 assert.equal(result.slots.length,11);
 assert.deepEqual(result.slots.map(x=>x.slotId),extended.entries.map(e=>e.slotId));
});
test("historical digest excludes mutable live personas while preserving finish truth",()=>{
 const first=immutableResultDigest(show);
 const altered={...show,entries:[{...show.entries[0],performerIdentities:[]}]};
 assert.equal(first,immutableResultDigest(altered));
 assert.notEqual(first,immutableResultDigest({...show,entries:[{...show.entries[0],outcome:"FLASH_PIN"}]}));
});

test("429 conveys provider retry-after and uses compact facts",async()=>{
 await assert.rejects(()=>generateGroqReview(show,"fixture",async(_u,init)=>{
  const body=JSON.parse(String(init?.body));
  const packet=JSON.parse(body.messages[1].content.split("Records:\\n")[1]);
  assert.equal(packet.slots[0].key,"card_0");
  assert.ok(!JSON.stringify(packet).includes("slotId"));
  assert.ok(body.max_completion_tokens<1500);
  return new Response("",{status:429,headers:{"retry-after":"75"}});
 }),e=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_LIMIT"&&
  e.retryAfterSeconds===75&&e.message.includes("75 seconds"));
});
