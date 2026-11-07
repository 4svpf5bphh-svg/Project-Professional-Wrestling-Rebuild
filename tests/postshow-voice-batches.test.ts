import test from "node:test";
import assert from "node:assert/strict";
import {getWrestlingBenchmark} from "../src/domain/wrestling-ai-benchmark.js";
import {postShowVoiceBrief,postShowVoicePrompt,
 validatePostShowVoiceCopy,readPostShowVoiceCopy}
 from "../src/domain/postshow-voice-batch.js";
import {postShowVoiceEnabled,generatePostShowVoiceCopy}
 from "../src/db/postshow-voice-batches.js";
import type {CompletedShowView} from "../src/db/show-results-view.js";

const fixture=()=>{
 const show=getWrestlingBenchmark("i-quit")!.show;
 // In production the five-read completed-show projection supplies identity
 // bearing sideParticipants. Synthetic Lab fixtures only carry side names.
 const entry=show.entries[0]!;
 if(entry.matchContext)
  entry.matchContext.sideParticipants=entry.matchContext.sides.map((side,i)=>
   side.map((name,j)=>({personId:"fixture-"+(i+j),name})));
 return show;
};
const source=()=>postShowVoiceBrief(fixture());
const valid={
 news:{headline:"Mercer forces the words out of Wolfe",
  summary:"Jett Mercer secured a verbal I Quit surrender against Ronan Wolfe at the completed show. The technical aggressor increased the pressure until Wolfe finally conceded, giving Mercer the certified win."},
 wrestler:{text:"I went through the ropes ready for a fight, and I earned the decision. Everybody saw what happened between the bells."},
 roadAgent:{note:"Check the condition and pacing before their next demanding singles bout; give the rivalry some room to breathe rather than repeating this exact match next week."}
};
test("shortform AI can only run on the expressly approved main World after manual publish",()=>{
 const env={VERCEL_ENV:"production",VERCEL_GIT_COMMIT_REF:"main",
  PPW_POSTSHOW_AI_ENABLED:"YES",PPW_MAIN_WORLD_APPROVED:"YES",
  PPW_MAIN_WORLD_ID:"world",GROQ_API_KEY:"dummy"};
 assert.equal(postShowVoiceEnabled(env,"world"),true);
 for(const mod of [
  {VERCEL_ENV:"development"},{VERCEL_GIT_COMMIT_REF:"phase44-certified-shortform-voices"},
  {PPW_POSTSHOW_AI_ENABLED:"NO"},{PPW_POSTSHOW_AI_ENABLED:undefined},
  {PPW_MAIN_WORLD_APPROVED:"NO"},{PPW_MAIN_WORLD_ID:"other"},
  {GROQ_API_KEY:undefined}
 ]){
  assert.equal(postShowVoiceEnabled({...env,...mod},"world"),false);
 }
 assert.equal(postShowVoiceEnabled({...env,VERCEL_ENV:"preview",
  VERCEL_GIT_COMMIT_REF:"phase43-ai-benchmark-safe-preview"},"world"),false);
});
test("one certified evidence brief contains no private booking instructions",()=>{
 const brief=source();
 assert.equal(brief.mainEvent?.finish,"verbal I Quit surrender");
 assert.deepEqual(brief.mainEvent?.winners,["Jett Mercer"]);
 assert.ok(brief.wrestler?.personId);
 assert.equal(brief.roadAgent,null);
 const payload=JSON.stringify(postShowVoicePrompt(brief));
 assert.ok(payload.length<5300,"The batch must stay inexpensive");
 assert.match(payload,/Jett Mercer/);
 assert.match(payload,/Ronan Wolfe/);
 assert.doesNotMatch(payload,/GROQ_API_KEY|DATABASE_URL|private future booking/i);
});
test("shortform validation anchors news and wrestler to verified participants",()=>{
 const brief=source();
 const saved=validatePostShowVoiceCopy(brief,valid);
 assert.ok(saved?.news);
 assert.equal(saved?.news?.slotId,brief.mainEvent?.slotId);
 assert.equal(saved?.wrestler?.personId,brief.wrestler?.personId);
 assert.equal(saved?.roadAgent,null,"No named Road Agent report is present");
 assert.deepEqual(readPostShowVoiceCopy(fixture(),saved),saved);
 assert.equal(validatePostShowVoiceCopy(brief,{
  news:{...valid.news,summary:"A new wrestler signed a multi-year contract tonight and won the title"},
  wrestler:{text:"I lost and was pinned in the ring after a terrible match"},
  roadAgent:null
 }),null);
 const foreign=structuredClone(saved)!;
 if(foreign.wrestler)foreign.wrestler.personId="someone-else";
 if(foreign.news)foreign.news.slotId="future-show";
 assert.equal(readPostShowVoiceCopy(fixture(),foreign),null);
});
test("a suspicious news claim cannot erase separately valid wrestler copy",()=>{
 const brief=source();
 const result=validatePostShowVoiceCopy(brief,{
  news:{headline:"A rumour of another secret contract signing",summary:"Mercer signed with another promotion and was subsequently arrested after the show."},
  wrestler:valid.wrestler,roadAgent:null});
 assert.equal(result?.news,null);
 assert.ok(result?.wrestler?.text);
});
test("one 20B request writes all eligible shortform voices without repeated page-view calls",async()=>{
 const show=fixture();
 let requests=0;
 const result=await generatePostShowVoiceCopy(show,"dummy",async(_url,init)=>{
  requests++;
  const payload=JSON.parse(String(init?.body));
  assert.equal(payload.model,"openai/gpt-oss-20b");
  assert.equal(payload.response_format.type,"json_object");
  assert.equal(payload.reasoning_format,"hidden");
  assert.equal(payload.max_completion_tokens,330);
  assert.ok(String(payload.messages[1].content).includes(show.showId));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(valid)}}]}),{status:200});
 });
 assert.equal(requests,1);
 assert.ok(result?.news);
 assert.ok(result?.wrestler);
 assert.equal(result?.roadAgent,null);
});
test("Groq failures and invalid JSON fail closed with no retry",async()=>{
 for(const answer of [
  new Response(JSON.stringify({error:{message:"Bad request"}}),{status:400}),
  new Response(JSON.stringify({choices:[{message:{content:"not json"}}]}),{status:200}),
  new Response(JSON.stringify({choices:[{finish_reason:"length",message:{
   content:JSON.stringify(valid)}}]}),{status:200})
 ]){
  let calls=0;
  const actual=await generatePostShowVoiceCopy(fixture(),"dummy",async()=>{
   calls++;return answer.clone();
  });
  assert.equal(actual,null);
  assert.equal(calls,1);
 }
});
test("non-show contexts have no eligible public writer and cannot trigger Groq",async()=>{
 const empty={...fixture(),entries:[],matchCount:0,angleCount:0,
  staffReport:null} as CompletedShowView;
 let calls=0;
 const result=await generatePostShowVoiceCopy(empty,"dummy",async()=>{
  calls++;throw Error("Unexpected Groq request");
 });
 assert.equal(result,null);
 assert.equal(calls,0);
});
test("Road Agent only gets a voice with an actual staff report and concrete observation",()=>{
 const show=fixture();
 const completed={...show,staffReport:{
  reporter:"Alex Vale",headline:"Pacing needed adjustment",praise:"Good match",
  concern:"A long final stretch",recommendation:"Allow time to recover"},
  entries:show.entries.map(e=>({...e,
   fallout:{...e.fallout,actualMinutes:31},
   matchContext:e.matchContext?{...e.matchContext,plannedMinutes:24}:undefined
  }))} as CompletedShowView;
 const brief=postShowVoiceBrief(completed);
 assert.ok(brief.roadAgent);
 assert.match(brief.roadAgent!.recordedObservation,/exceeded its planned time/);
 const accepted=validatePostShowVoiceCopy(brief,valid);
 assert.ok(accepted?.roadAgent);
 assert.equal(accepted?.roadAgent?.slotId,brief.roadAgent?.slotId);
 const noStaff=postShowVoiceBrief({...completed,staffReport:null});
 assert.equal(noStaff.roadAgent,null);
});

test("verified pinfall can be reported naturally, but the defeated wrestler cannot become winner",()=>{
 const brief=postShowVoiceBrief(getWrestlingBenchmark("steel-cage")!.show);
 const headline="Holt has the last word inside the cage";
 const lawful="Mason Holt won by pinfall over Isaiah King in the completed Steel Cage contest. The walls restricted their movement and the closing cover ended the encounter in the ring, exactly as the official result states.";
 const wrong="Isaiah King defeated Mason Holt by a pinfall in the completed Steel Cage contest. The crowd roared for the underdog as the official result gave the decision to King instead of Holt.";
 const invented="Mason Holt won by pinfall over Isaiah King at the completed show, but was hospitalised with a concussion after the referee raised his hand at ringside.";
 assert.ok(validatePostShowVoiceCopy(brief,{news:{headline,summary:lawful}})?.news);
 assert.equal(validatePostShowVoiceCopy(brief,{news:{headline,summary:wrong}}),null);
 assert.equal(validatePostShowVoiceCopy(brief,{news:{headline,summary:invented}}),null);
});
