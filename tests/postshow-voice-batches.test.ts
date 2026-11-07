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
 news:{headline:"Wolfe Finally Says the Words Against Mercer",
  summary:"Ronan Wolfe held out against Jett Mercer in the I Quit match, but the stubborn resistance finally gave way. Wolfe's verbal surrender handed Mercer a hard-earned victory."},
 wrestler:{text:"Ronan Wolfe fought the answer, but I kept the pressure on until he said it. That's why I'm the technician and he's the footnote."},
 roadAgent:{note:"Consider a short Wolfe response segment before another fight; let the I Quit surrender carry weight instead of repeating the same stipulation immediately."}
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
 assert.equal(brief.wrestler?.character,"COLD-BLOODED TECHNICIAN");
 assert.equal(brief.wrestler?.style,"TECHNICAL");
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
  assert.equal(payload.max_completion_tokens,650);
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
 const lawful="Mason Holt won by pinfall over Isaiah King in the Steel Cage match. The imposing walls kept the fight enclosed, and a decisive three-count gave Holt the victory without an escape.";
 const wrong="Isaiah King defeated Mason Holt by a pinfall in the completed Steel Cage contest. The crowd roared for the underdog as the official result gave the decision to King instead of Holt.";
 const invented="Mason Holt won by pinfall over Isaiah King at the completed show, but was hospitalised with a concussion after the referee raised his hand at ringside.";
 assert.ok(validatePostShowVoiceCopy(brief,{news:{headline,summary:lawful}})?.news);
 assert.equal(validatePostShowVoiceCopy(brief,{news:{headline,summary:wrong}}),null);
 assert.equal(validatePostShowVoiceCopy(brief,{news:{headline,summary:invented}}),null);
});

test("fictional 20B voice lab uses matched identities and all three grounded sources",async()=>{
 const {getPostShowVoiceBenchmark,POSTSHOW_VOICE_SCENARIOS}=
  await import("../src/domain/postshow-voice-lab.js");
 for(const scenario of POSTSHOW_VOICE_SCENARIOS){
  const fixture=getPostShowVoiceBenchmark(scenario.id);
  assert.ok(fixture);
  assert.equal(fixture.scenario.id,scenario.id);
  assert.ok(fixture.brief.mainEvent?.winners.length);
  assert.ok(fixture.brief.wrestler?.personId);
  assert.ok(fixture.brief.wrestler?.character);
  assert.ok(fixture.brief.roadAgent?.recordedObservation);
  assert.match(fixture.brief.roadAgent!.recordedObservation,/strong reaction|exceeded|execution|stood out/i);
  assert.equal(fixture.show.showId,"benchmark:"+scenario.id);
 }
 assert.equal(getPostShowVoiceBenchmark("another-show"),null);
});
test("shortform lab validates all three parts from a single 20B fixture response",async()=>{
 const {getPostShowVoiceBenchmark}=await import("../src/domain/postshow-voice-lab.js");
 const fixture=getPostShowVoiceBenchmark("i-quit")!;
 let count=0;
 const generated=await generatePostShowVoiceCopy(fixture.show,"dummy",
  async(_url,init)=>{
   count++;
   const body=JSON.parse(String(init?.body));
   assert.equal(body.max_completion_tokens,650);
   assert.equal(body.response_format.type,"json_object");
   assert.equal(body.model,"openai/gpt-oss-20b");
   assert.match(body.messages[1].content,/Ronan Wolfe/);
   return new Response(JSON.stringify({choices:[{message:{
    content:JSON.stringify(valid)}}]}),{status:200});
  });
 assert.equal(count,1);
 assert.ok(generated?.news);
 assert.ok(generated?.wrestler);
 assert.ok(generated?.roadAgent);
 assert.deepEqual(readPostShowVoiceCopy(fixture.show,generated),generated);
});

test("20B failures expose only categorical diagnostics and never retain rejected prose",async()=>{
 const {getPostShowVoiceBenchmark}=await import("../src/domain/postshow-voice-lab.js");
 const fixture=getPostShowVoiceBenchmark("i-quit")!;
 for(const sample of [
  {content:"not json",expected:"INVALID_JSON"},
  {content:JSON.stringify({news:"Headline and article",
   wrestler:"In character reply",roadAgent:"Practical advice"}),expected:"WRONG_SHAPE"},
  {content:JSON.stringify({news:{headline:"Too short",summary:"Jett Mercer"},
   wrestler:{text:"No"},roadAgent:{note:"No"}}),expected:"ALL_REJECTED"},
  {content:JSON.stringify(valid),expected:"ACCEPTED"}
 ]){
  let calls=0,diagnosis:unknown=null;
  const text=sample.content;
  const result=await generatePostShowVoiceCopy(fixture.show,"dummy",async()=>{
   calls++;
   return new Response(JSON.stringify({choices:[{finish_reason:"stop",
    message:{content:text}}]}),{status:200});
  },undefined,(value)=>{diagnosis=value;});
  assert.equal(calls,1);
  const d=diagnosis as {category:string;news:string;
   wrestler:string;roadAgent:string}|null;
  assert.equal(d?.category,sample.expected);
  assert.ok(d);
  if(sample.expected==="WRONG_SHAPE"){
   assert.equal(d.news,"FORMAT_REJECTED");
   assert.equal(d.wrestler,"FORMAT_REJECTED");
   assert.equal(d.roadAgent,"FORMAT_REJECTED");
  }
  if(sample.expected==="ALL_REJECTED"){
   assert.equal(d.news,"LENGTH_REJECTED");
   assert.equal(d.wrestler,"LENGTH_REJECTED");
   assert.equal(d.roadAgent,"LENGTH_REJECTED");
  }
  assert.deepEqual(Object.keys(d).sort(),
   ["category","news","wrestler","roadAgent"].sort(),
   "Diagnostics contain no Groq prose, error body, names or content");
  assert.equal(!!result,sample.expected==="ACCEPTED");
 }
 let partial:unknown=null;
 const newsOnly=await generatePostShowVoiceCopy(fixture.show,"dummy",async()=>
  new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   news:valid.news,wrestler:null,roadAgent:null})}}]}),{status:200}),
  undefined,diagnosis=>{partial=diagnosis;});
 assert.ok(newsOnly?.news);
 assert.equal(newsOnly?.wrestler,null);
 assert.equal(newsOnly?.roadAgent,null);
 assert.deepEqual(partial,{category:"PARTIAL",news:"ACCEPTED",
  wrestler:"MISSING",roadAgent:"MISSING"});
 let diagnosis:unknown;
 await generatePostShowVoiceCopy(fixture.show,"dummy",async()=>
  new Response("provider unavailable",{status:400}),undefined,
  value=>{diagnosis=value;});
 assert.equal((diagnosis as {category?:string})?.category,"HTTP_REJECTED");
});
test("20B prompt explicitly requires nested JSON fields and a bounded concise response",()=>{
 const brief=postShowVoiceBrief(fixture());
 const prompt=postShowVoicePrompt(brief);
 assert.match(prompt[0]!.content,/"news":\{"headline"/);
 assert.match(prompt[0]!.content,/"wrestler":\{"text"/);
 assert.match(prompt[0]!.content,/"roadAgent":\{"note"/);
 assert.match(prompt[0]!.content,/use null for that voice/);
});

test("news avoids technical game copy yet respects an I Quit finish",()=>{
 const brief=source();
 assert.ok(brief.mainEvent);
 assert.doesNotMatch(brief.mainEvent!.summary,/No other winning method applies/i,
  "Technical validator warnings must not leak into the journalism input");
 assert.equal(brief.mainEvent!.matchType,"I Quit Match · SINGLES");
 assert.ok(validatePostShowVoiceCopy(brief,valid)?.news);
 assert.equal(validatePostShowVoiceCopy(brief,{
  news:{headline:"Mercer Claims the I Quit Victory",
   summary:"Jett Mercer forced Ronan Wolfe to say I quit in the main event. No other winning method applied, confirming Mercer's victory as the official result."}
 }),null,"Reject stilted technical narration rather than publishing it");
 assert.equal(validatePostShowVoiceCopy(brief,{
  news:{headline:"Mercer Takes a Three-Count Win",
   summary:"Jett Mercer pinned Ronan Wolfe in a gripping three-count victory. The official announced Mercer's pinfall after a bruising contest that left the crowd stunned."}
 }),null,"Cannot turn a spoken I Quit surrender into a pinfall");
});
test("wrestler reaction must mention a recorded opponent or distinctive match event",()=>{
 const brief=source();
 assert.deepEqual(brief.wrestler?.opponentNames,["Ronan Wolfe"]);
 const good=validatePostShowVoiceCopy(brief,{wrestler:valid.wrestler});
 assert.ok(good?.wrestler);
 assert.equal(validatePostShowVoiceCopy(brief,{wrestler:{
  text:"I keep my composure, deliver precise strikes, and always win when the opponent quits."
 }}),null,"Unanchored generic HOT TAG boasts should not replace certified reactions");
 assert.ok(validatePostShowVoiceCopy(brief,{wrestler:{
  text:"I came into that I Quit match ready for a test. I left having earned every inch of that result."
 }})?.wrestler,"A specific certified stipulation is sufficient without naming a wrestler");
 assert.equal(validatePostShowVoiceCopy(brief,{wrestler:{
  text:"I quit tonight because the pressure was unbearable, and the match simply got away from me."
 }}),null,"The winning wrestler cannot claim to have surrendered");
});
test("Road Agent advises on the certified issue without invented injury or chemistry",()=>{
 const show=fixture();
 const relevant={...show,staffReport:{
  reporter:"Morgan Reed",staffId:null,headline:"Post-show performance report",
  praise:"Strong reactions",concern:"Avoid repeating the stipulation",
  recommendation:"Give the next appearance a purpose",
  strongestMatchId:show.entries[0]!.slotId,reviewedMatches:1
 }} as CompletedShowView;
 const agentBrief=postShowVoiceBrief(relevant);
 assert.equal(agentBrief.roadAgent?.issue,"standout");
 assert.ok(agentBrief.roadAgent?.suggestedNextStep.includes("response angle"));
 assert.doesNotMatch(agentBrief.roadAgent!.recordedObservation,/4\.00 stars/i);
 assert.ok(validatePostShowVoiceCopy(agentBrief,{
  roadAgent:valid.roadAgent
 })?.roadAgent);
 assert.equal(validatePostShowVoiceCopy(agentBrief,{roadAgent:{note:
  "Consider a medical examination because Wolfe suffered a concussion during the fight. Give him six weeks away and book a comeback angle."
 }}),null);
 assert.equal(validatePostShowVoiceCopy(agentBrief,{roadAgent:{note:
  "I spotted poor chemistry between Mercer and Wolfe throughout the bout. Book a new partner immediately to repair their problem."
 }}),null);
});

test("earlier certified news and generic HOT TAG remain visible as historical records",()=>{
 const show=fixture(),brief=postShowVoiceBrief(show);
 const archived={
  news:{headline:"Jett Mercer Wins I Quit Match",
   summary:"Jett Mercer secured victory when Ronan Wolfe verbally surrendered, conceding the I Quit match. No other winning method applied, confirming Mercer's triumph."},
  wrestler:{text:"I keep my composure, deliver precise strikes, and always win when the opponent quits."},
  roadAgent:null
 };
 assert.equal(validatePostShowVoiceCopy(brief,archived),null,
  "New editorial standards apply to future generation");
 const cached=readPostShowVoiceCopy(show,{version:1,
  news:{...archived.news,slotId:brief.mainEvent!.slotId},
  wrestler:{...archived.wrestler,slotId:brief.wrestler!.slotId,
   personId:brief.wrestler!.personId},roadAgent:null});
 assert.ok(cached?.news);
 assert.ok(cached?.wrestler);
 assert.equal(cached.roadAgent,null);
 const oldNegation=readPostShowVoiceCopy(show,{version:1,
  news:{slotId:brief.mainEvent!.slotId,
   headline:"Mercer gets the final answer",
   summary:"Jett Mercer defeated Ronan Wolfe by a verbal I Quit surrender at the completed show. The official result records Wolfe's spoken concession, not a pinfall or tap-out."},
  wrestler:null,roadAgent:null});
 assert.ok(oldNegation?.news,
  "Negating an unbooked pinfall is not the same as falsely claiming one");
});

test("certified wrestler turn can produce a real event reaction with no invented opponent",()=>{
 const base=fixture();
 const original=base.entries[0]!;
 const turn={...original,type:"SEGMENT" as const,
  segmentKind:"TURN",outcome:"HAPPENS",
  matchContext:undefined,fallout:undefined,
  headline:"Mercer reveals where he stands",
  summary:"Jett Mercer made a recorded turn in front of the crowd.",
  actorIds:["fixture-0"],targetIds:[],
  segmentContext:{actorNames:["Jett Mercer"],targetNames:[],
   videoPurpose:null,stableDecision:null,turnTargetAlignment:"HEEL"}
 };
 const scene:CompletedShowView={...base,entries:[turn],
  matchCount:0,angleCount:1};
 const brief=postShowVoiceBrief(scene);
 assert.equal(brief.mainEvent,null);
 assert.equal(brief.wrestler?.displayName,"Jett Mercer");
 assert.equal(brief.wrestler?.eventKind,"TURN");
 assert.deepEqual(brief.wrestler?.opponentNames,[]);
 assert.ok(validatePostShowVoiceCopy(brief,{wrestler:{text:
  "I made my choice in front of the crowd. Everybody knows where I stand now, and no one can make that decision for me."}})?.wrestler);
 assert.equal(validatePostShowVoiceCopy(brief,{wrestler:{text:
  "I won a brutal cage match tonight and absolutely destroyed my opponent in the ring."}}),null);
});
test("editorial facts remove technical disclaimers without leaving punctuation fragments",()=>{
 const {show:steel}=getWrestlingBenchmark("steel-cage")!;
 const cage=postShowVoiceBrief(steel);
 assert.match(cage.mainEvent!.summary,/pinned Isaiah King/);
 assert.doesNotMatch(cage.mainEvent!.summary,/winning condition|;\s*$/i);
 const {show:tag}=getWrestlingBenchmark("tag-standard")!;
 const tagBrief=postShowVoiceBrief(tag);
 assert.doesNotMatch(tagBrief.mainEvent!.summary,/individual fall scorer was not recorded|;\s*$/i);
 assert.deepEqual(tagBrief.mainEvent!.winners,["Rey Sol","Marcus Drake"]);
});
