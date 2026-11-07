import {test} from "node:test";
import assert from "node:assert/strict";
import {getWrestlingBenchmark,WRESTLING_BENCHMARKS,assessWrestlingBenchmark}
 from "../src/domain/wrestling-ai-benchmark.js";
import {ringsideBrief,ringsideStipulationNote,validateRingsideCopy}
 from "../src/domain/ringside-editorial.js";
import {wrestlingMatchIQ} from "../src/domain/wrestling-iq.js";
test("Fifteen deterministic wrestling scenarios provide certified results and no World data",()=>{
 assert.equal(WRESTLING_BENCHMARKS.length,15);
 assert.equal(new Set(WRESTLING_BENCHMARKS.map(s=>s.id)).size,15);
 for(const meta of WRESTLING_BENCHMARKS){
  const first=getWrestlingBenchmark(meta.id)!;
  const second=getWrestlingBenchmark(meta.id)!;
  assert.deepEqual(first,second,"benchmarks must be stable for model comparison");
  assert.equal(first.show.entries.length,1);
  const entry=first.show.entries[0]!,brief=ringsideBrief(first.show).slots[0]!;
  assert.equal(brief.match!.winners.join("|"),entry.matchContext!.winnerNames.join("|"));
  assert.equal(brief.finish,entry.outcome);
  assert.ok(wrestlingMatchIQ(entry));
  assert.ok(first.show.showId.startsWith("benchmark:"));
  assert.equal(first.show.matchCount,1);
  assert.ok(!JSON.stringify(first).includes("api_key"));
  const ok={showHeadline:"A story at ringside",opening:"The crowd greeted the bell.",
   closing:"There was plenty to consider after the finish.",slots:[{
    slotId:entry.slotId,headline:"The main event",recap:entry.outcome==="VERBAL_SURRENDER"?
     "The defeated opponent verbally surrendered to the referee after saying I quit.":
     "The official victor had their hand raised once the decisive result was reached."}]};
  assert.deepEqual(validateRingsideCopy(ok,first.show),ok);
  assert.equal(assessWrestlingBenchmark(meta.id,ok).certifiedFactsValidated,true);
 }
 assert.equal(getWrestlingBenchmark("does-not-exist"),null);
});
test("Tag, trios, multi-team and battle-royal classifications survive real fixture formats",()=>{
 for(const [id,format] of [["tag-standard","TAG"],["tag-squash","TAG"],["trios","TAG"],
  ["multi-team","MULTI_TEAM"],["triple-threat","MULTI_PERSON"],["battle-royal","BATTLE_ROYAL"]] as const){
  assert.equal(wrestlingMatchIQ(getWrestlingBenchmark(id)!.show.entries[0]!)!.format,format);
 }
});
test("Cage, I Quit, Iron Man and Two Falls use canonical winning conditions",()=>{
 for(const [id,stip,finish] of [
  ["steel-cage","STEEL_CAGE","CLEAN_PIN"],["i-quit","I_QUIT","VERBAL_SURRENDER"],
  ["iron-man","IRON_MAN","MOST_FALLS"],["two-falls","TWO_OUT_OF_THREE","SECOND_FALL"]
 ] as const){
  const e=getWrestlingBenchmark(id)!.show.entries[0]!;
  assert.equal(ringsideStipulationNote(e.matchContext!.format)?.stipulation,stip);
  assert.equal(e.outcome,finish);
 }
});
test("Benchmark gate rejects decisive impossible finishes and untagged legal competitors",()=>{
 const scenario=(id:string,recap:string)=>{
  const x=getWrestlingBenchmark(id)!.show;
  return ()=>assessWrestlingBenchmark(id,{showHeadline:"A rough night",opening:"The crowd was tense.",
   closing:"The final bell caused debate.",
   slots:[{slotId:x.entries[0]!.slotId,headline:"The final stretch",recap}]});
 };
 assert.throws(scenario("i-quit","The loser tapped out to end it."),/verbal surrender/);
 assert.throws(scenario("steel-cage","He escaped the cage for the win."),/Cage escape/);
 assert.throws(scenario("tag-standard","Both team partners were legal throughout the match."),/tag-team legality/);
 assert.throws(scenario("triple-threat","The hot tag brought the partner into the ring."),/tag-team mechanics/);
 assert.throws(scenario("singles-submission","The winner pinned them for the three-count to win."),/pinfall/);
 const good=scenario("tag-standard","The winning team worked from the corner, with each legal tag shifting momentum.");
 assert.doesNotThrow(good);
 assert.equal(good().diagnosticCues[0],"Some tag-team mechanics mentioned");
});

test("Model comparisons use identical certified fixture facts and one provider call each",async()=>{
 const {generateGroqReview}=await import("../src/db/ringside-commentary.js");
 const {DEFAULT_RINGSIDE_SETTINGS}=await import("../src/domain/ringside-settings.js");
 const samples=["tag-standard","i-quit","steel-cage","singles-squash"];
 for(const id of samples){
  const {show}=getWrestlingBenchmark(id)!;
  const payloads:string[]=[];
  for(const model of ["openai/gpt-oss-120b","openai/gpt-oss-20b"] as const){
   let calls=0;
   const review=await generateGroqReview(show,"fixture",async(_url,init)=>{
    calls++;
    const body=JSON.parse(String(init?.body));
    assert.equal(body.model,model);
    assert.equal(body.response_format.json_schema.strict,true);
    payloads.push(body.messages[1].content);
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
     showHeadline:"An eventful night",opening:"The crowd watched closely.",
     closing:"The certified result settled the contest.",
     slots:{card_0:{headline:"An orderly finish",
      recap:id==="i-quit"?
       "Ronan Wolfe verbally surrendered, saying I quit into the referee microphone.":
       "The match unfolded with clear momentum before the documented winning side received the decision."}}
    })}}]}),{status:200});
   },{...DEFAULT_RINGSIDE_SETTINGS,model});
   assert.equal(calls,1);
   assert.equal(assessWrestlingBenchmark(id,review).certifiedFactsValidated,true);
  }
  assert.deepEqual(payloads[0],payloads[1],
   "The model identity must never change match evidence or the factual rubric");
 }
});

test("20B benchmark recovers from a strict Groq 400 with one verified JSON-mode attempt",async()=>{
 const {generateGroqReview,classifyGroqBadRequest}=await import("../src/db/ringside-commentary.js");
 const {DEFAULT_RINGSIDE_SETTINGS}=await import("../src/domain/ringside-settings.js");
 const {show}=getWrestlingBenchmark("i-quit")!;
 let calls=0;
 const result=await generateGroqReview(show,"fixture",async(_url,init)=>{
  calls++;
  const request=JSON.parse(String(init?.body));
  assert.equal(request.model,"openai/gpt-oss-20b");
  if(calls===1){
   assert.equal(request.response_format.type,"json_schema");
   assert.equal(request.response_format.json_schema.strict,true);
   return new Response(JSON.stringify({error:{
    type:"invalid_request_error",code:"structured_generation_failed",
    message:"This provider could not generate strict JSON for the given request"
   }}),{status:400});
  }
  assert.equal(calls,2,"one compatibility retry only");
  assert.equal(request.response_format.type,"json_object");
  assert.equal(request.reasoning_format,"hidden");
  assert.equal(request.response_format.json_schema,undefined);
  assert.match(request.messages[1].content,/card_N key/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Mercer survives a twenty-five-minute fight",
   opening:"The cage-free war demanded a spoken surrender.",
   closing:"The decisive words settled a hard-hitting night.",
   slots:{card_0:{headline:"Mercer makes Wolfe say it",
    recap:"After a lengthy, physical I Quit match, Ronan Wolfe finally said I quit into the referee's microphone, giving Jett Mercer the certified victory."}}
  })}}]}),{status:200});
 },{...DEFAULT_RINGSIDE_SETTINGS,model:"openai/gpt-oss-20b"},
 undefined,undefined,"GROQ",true);
 assert.equal(calls,2);
 assert.equal(assessWrestlingBenchmark("i-quit",result).certifiedFactsValidated,true);
 assert.equal(await classifyGroqBadRequest(new Response(JSON.stringify({
  error:{code:"json_validate_failed",message:"Generated JSON did not match schema"}
 }),{status:400})),"STRUCTURED_OUTPUT");
});
test("20B compatibility is isolated to the benchmark; bad parameters and 429 never retry",async()=>{
 const {generateGroqReview,RingsideGenerationError,classifyGroqBadRequest}=
  await import("../src/db/ringside-commentary.js");
 const {DEFAULT_RINGSIDE_SETTINGS}=await import("../src/domain/ringside-settings.js");
 const {show}=getWrestlingBenchmark("i-quit")!;
 const small={...DEFAULT_RINGSIDE_SETTINGS,model:"openai/gpt-oss-20b" as const};
 for(const data of [
  {settings:small,benchmark:false,status:400,code:"structured_generation_failed",expected:"PROVIDER_ERROR"},
  {settings:small,benchmark:true,status:400,code:"invalid_reasoning_effort",expected:"PROVIDER_ERROR"},
  {settings:small,benchmark:true,status:429,code:"rate_limit_exceeded",expected:"PROVIDER_LIMIT"},
  {settings:DEFAULT_RINGSIDE_SETTINGS,benchmark:true,status:400,code:"structured_generation_failed",expected:"PROVIDER_ERROR"}
 ]){
  let calls=0;
  await assert.rejects(
   ()=>generateGroqReview(show,"fixture",async()=>{
    calls++;
    return new Response(JSON.stringify({error:{
     code:data.code,message:data.code==="invalid_reasoning_effort"?
      "Invalid reasoning_effort parameter":"Sensitive user text MUST NOT appear in the UI"
    }}),{status:data.status});
   },data.settings,undefined,undefined,"GROQ",data.benchmark),
   (error:unknown)=>error instanceof RingsideGenerationError&&error.code===data.expected&&
    !error.message.includes("Sensitive user text"));
  assert.equal(calls,1,"rejection outside the compatibility case must not retry");
 }
 assert.equal(await classifyGroqBadRequest(new Response(JSON.stringify({
  error:{code:"invalid_reasoning_effort",message:"Invalid reasoning_effort parameter"}
 }),{status:400})),"REASONING");
 assert.equal(await classifyGroqBadRequest(new Response(JSON.stringify({
  error:{code:"model_not_found",message:"Model not found"}
 }),{status:400})),"MODEL");
});
test("20B benchmark never loops more than twice if compatibility mode is also rejected",async()=>{
 const {generateGroqReview,RingsideGenerationError}=await import("../src/db/ringside-commentary.js");
 const {DEFAULT_RINGSIDE_SETTINGS}=await import("../src/domain/ringside-settings.js");
 const {show}=getWrestlingBenchmark("i-quit")!;
 const modes:string[]=[];
 await assert.rejects(()=>generateGroqReview(show,"fixture",async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  modes.push(body.response_format.type);
  return new Response(JSON.stringify({error:{code:"structured_generation_failed"}}),{status:400});
 },{...DEFAULT_RINGSIDE_SETTINGS,model:"openai/gpt-oss-20b"},
 undefined,undefined,"GROQ",true),
 (e:unknown)=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_ERROR");
 assert.deepEqual(modes,["json_schema","json_object"]);
});
