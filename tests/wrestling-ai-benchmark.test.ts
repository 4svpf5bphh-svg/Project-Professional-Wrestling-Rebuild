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

test("20B fictional benchmark starts with JSON object, not a failed strict-schema request",async()=>{
 const {generateGroqReview}=await import("../src/db/ringside-commentary.js");
 const {DEFAULT_RINGSIDE_SETTINGS}=await import("../src/domain/ringside-settings.js");
 const {show}=getWrestlingBenchmark("i-quit")!;
 let calls=0;
 const result=await generateGroqReview(show,"fixture",async(_url,init)=>{
  calls++;
  const request=JSON.parse(String(init?.body));
  assert.equal(request.model,"openai/gpt-oss-20b");
  assert.equal(request.response_format.type,"json_object");
  assert.equal(request.reasoning_format,"hidden");
  assert.equal(request.response_format.json_schema,undefined);
  assert.match(request.messages[1].content,/card_N key/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Mercer survives a twenty-five-minute fight",
   opening:"The pressure built around the microphone.",
   closing:"The decisive words settled a hard-hitting night.",
   slots:{card_0:{headline:"Mercer makes Wolfe say it",
    recap:"After a lengthy, physical I Quit match, Ronan Wolfe finally said I quit into the referee's microphone, giving Jett Mercer the certified victory."}}
  })}}]}),{status:200});
 },{...DEFAULT_RINGSIDE_SETTINGS,model:"openai/gpt-oss-20b"},
 undefined,undefined,"GROQ",true);
 assert.equal(calls,1,"Valid 20B JSON mode should use exactly one provider call");
 assert.equal(assessWrestlingBenchmark("i-quit",result).certifiedFactsValidated,true);
});
test("20B compatibility is isolated to the benchmark; bad parameters and 429 never retry",async()=>{
 const {generateGroqReview,RingsideGenerationError}=
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

});
test("20B JSON rejection fails on the first call, without wasting a strict-schema retry",async()=>{
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
 assert.deepEqual(modes,["json_object"]);
});

test("stipulation drama briefs put a concrete escalation near the verified match data",()=>{
 for(const [id,motif,finish] of [
  ["i-quit",/refus|microphone|physical escalation/i,/ONLY the losing wrestler finally says I quit/],
  ["steel-cage",/cramped movement|impact against the steel/i,/certified pin inside the cage/],
  ["iron-man",/clock-pressure|time runs down/i,/without invented scores/]
 ] as const){
  const {show}=getWrestlingBenchmark(id)!;
  const rule=ringsideBrief(show).slots[0]!.match!.stipulationRules!;
  assert.ok(rule.dramaticBeats,"A high-stakes stipulation should have a distinct scene arc");
  assert.match(rule.dramaticBeats,motif);
  assert.match(rule.dramaticBeats,finish);
  assert.ok(rule.dramaticBeats.length<360,"Keep the free Groq prompt economical");
 }
 const generic=getWrestlingBenchmark("singles-technical")!.show;
 assert.equal(ringsideBrief(generic).slots[0]!.match!.stipulationRules,undefined);
});
test("quality diagnostics distinguish bare surrender from a physical I Quit story without altering result validation",()=>{
 const {show}=getWrestlingBenchmark("i-quit")!;
 const slotId=show.entries[0]!.slotId;
 const copy=(recap:string)=>({
  showHeadline:"The night belonged to Mercer",
  opening:"The crowd knew the battle would demand courage.",
  closing:"The final words settled the contest.",
  slots:[{slotId,headline:"A hard-fought surrender",recap}]
 });
 const generic=copy("After 25 minutes Ronan Wolfe said I quit, and Jett Mercer won the match.");
 const dramatic=copy("Mercer twisted Wolfe's arm until the pressure forced another agonising struggle. Wolfe refused to quit, gritting his teeth while the referee pushed the microphone close. After another painful stretch, Ronan Wolfe finally said I quit aloud, handing Jett Mercer the victory.");
 const plain=assessWrestlingBenchmark("i-quit",generic);
 const vivid=assessWrestlingBenchmark("i-quit",dramatic);
 assert.equal(plain.certifiedFactsValidated,true);
 assert.equal(vivid.certifiedFactsValidated,true);
 assert.equal(plain.humanReviewRequired,true);
 assert.equal(vivid.humanReviewRequired,true);
 assert.ok(vivid.diagnosticCues.length>plain.diagnosticCues.length);
 assert.ok(vivid.diagnosticCues.includes("Resistance before surrender is described"));
 assert.ok(vivid.diagnosticCues.includes("Referee's surrender question is dramatized"));
 assert.ok(vivid.diagnosticCues.includes("Escalating physical pressure is described"));
});
test("cage context diagnostics distinguish backdrop mentions from impact against steel",()=>{
 const {show}=getWrestlingBenchmark("steel-cage")!;
 const slotId=show.entries[0]!.slotId;
 const sample=(recap:string)=>assessWrestlingBenchmark("steel-cage",{
  showHeadline:"Mason Holt holds firm",
  opening:"The enclosed ring heightened anticipation.",
  closing:"Holt took the certified victory.",
  slots:[{slotId,headline:"Holt finishes the contest",recap}]
 });
 const bare=sample("Inside the cage, Mason Holt defeated Isaiah King with a clean pin.");
 const physical=sample("With the crowd roaring, Holt slammed King against the cage mesh before working the closing stretch. Mason Holt then secured the verified pinfall inside the cage.");
 assert.equal(bare.certifiedFactsValidated,true);
 assert.equal(physical.certifiedFactsValidated,true);
 assert.ok(physical.diagnosticCues.includes("Steel enclosure affects the action"));
 assert.ok(!bare.diagnosticCues.includes("Steel enclosure affects the action"));
});

test("shared Results prompt stays compact without sacrificing certified fixture rules",async()=>{
 const {generateGroqReview}=await import("../src/db/ringside-commentary.js");
 const {DEFAULT_RINGSIDE_SETTINGS}=await import("../src/domain/ringside-settings.js");
 const {RINGSIDE_STYLE_GUIDE}=await import("../src/domain/ringside-editorial.js");
 const {estimatedGroqTokens}=await import("../src/domain/ai-director.js");
 const {show}=getWrestlingBenchmark("steel-cage")!;
 assert.ok(RINGSIDE_STYLE_GUIDE.length<6500,
  "Do not restore twelve thousand characters of redundant instructions per call");
 let rawBytes=0,reserved=0;
 await generateGroqReview(show,"fixture",async(_url,init)=>{
  const body=String(init?.body);
  rawBytes=body.length;
  const parsed=JSON.parse(body);
  reserved=estimatedGroqTokens(body,parsed.max_completion_tokens);
  assert.match(parsed.messages[1].content,/card_N key/);
  assert.doesNotMatch(parsed.messages[1].content,/benchmark-main-event/,
   "Official slot IDs are restored server-side and need not be sent to Groq");
  assert.match(parsed.messages[1].content,/dramaticBeats/,
   "Match-specific dramatic rules must remain beside certified facts");
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Holt takes the night",
   opening:"The steel enclosure tightened the tension.",
   closing:"The match was decided inside the ring.",
   slots:{card_0:{headline:"Holt pins King inside the cage",
    recap:"Holt drove King into the steel mesh, slowed the contest down, and ultimately pinned Isaiah King inside the cage."}}
  })}}]}),{status:200});
 },DEFAULT_RINGSIDE_SETTINGS);
 assert.ok(rawBytes<14500,"Lean one-match payload should stay comfortably bounded");
 assert.ok(reserved>1000&&reserved<6000,
  "The existing safety ledger must still reserve completion tokens");
});
