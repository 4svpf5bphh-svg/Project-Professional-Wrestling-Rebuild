import {test} from "node:test";
import assert from "node:assert/strict";
import {generateGroqReview,immutableResultDigest} from "../src/db/ringside-commentary.js";
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
test("Groq is invoked once for the full card and validates structured source IDs",async()=>{
 let calls=0;const fake:typeof fetch=async (_url,init)=>{calls++;
  assert.equal((init?.headers as Record<string,string>).authorization,"Bearer fixture");
  const body=JSON.parse(String(init?.body));
  assert.equal(body.messages.length,2);
  assert.equal(body.response_format.type,"json_schema");
  assert.equal(body.response_format.json_schema.strict,true);
  assert.equal(body.reasoning_effort,"low");
  assert.equal(body.temperature,0.92);
  assert.ok(body.max_completion_tokens>=900);
  assert.match(body.messages[0].content,/Marty Vale/);
  assert.match(body.messages[1].content,/One Winged Angel/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(review)}}]}),{status:200});
 };
 assert.equal((await generateGroqReview(show,"fixture",fake)).slots[0]?.slotId,"m");
 assert.equal(calls,1);
});
test("wrong slot and outages fail closed rather than fabricating a result",async()=>{
 const fake:typeof fetch=async()=>new Response(JSON.stringify({choices:[{message:{
  content:JSON.stringify({...review,slots:[{...review.slots[0],slotId:"forged"}]})}}]}));
 await assert.rejects(()=>generateGroqReview(show,"fixture",fake));
 await assert.rejects(()=>generateGroqReview(show,"fixture",async()=>new Response("",{status:429})));
});
test("historical digest excludes mutable live personas while preserving finish truth",()=>{
 const first=immutableResultDigest(show);
 const altered={...show,entries:[{...show.entries[0],performerIdentities:[]}]};
 assert.equal(first,immutableResultDigest(altered));
 assert.notEqual(first,immutableResultDigest({...show,entries:[{...show.entries[0],outcome:"FLASH_PIN"}]}));
});
