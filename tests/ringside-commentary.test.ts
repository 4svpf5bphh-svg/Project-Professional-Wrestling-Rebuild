import {test} from "node:test";
import assert from "node:assert/strict";
import {generateGroqReview,inspectRingsidePrompt,immutableResultDigest,ringsideResponseSchema,RingsideGenerationError} from "../src/db/ringside-commentary.js";
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
  assert.equal(body.response_format.type,"json_object",
   "Whole-card 120B shows must avoid Groq strict schema first-attempt 400");
  const fields=extended.entries.map((_,i)=>"card_"+i);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Eleven matches",opening:"The crowd was up for it.",
   closing:"Every recorded bout got its story.",
   slots:Object.fromEntries(fields.map((key,i)=>[key,{
    headline:"A hard-fought match "+i,
    recap:"Encounter "+(i+1)+" ended in the expected pinfall after an even contest."
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
  assert.ok(body.messages[1].content.includes('"key":"card_0"'));
  assert.ok(!body.messages[1].content.includes('"slotId":'));
  assert.ok(body.max_completion_tokens<1500);
  return new Response("",{status:429,headers:{"retry-after":"75"}});
 }),e=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_LIMIT"&&
  e.retryAfterSeconds===75&&e.message.includes("75 seconds"));
});

test("schema and editorial instruction agree on immutable card keys",async()=>{
 const fake:typeof fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  assert.match(body.messages[0].content,/card_0, card_1/);
  assert.match(body.messages[0].content,/Do not emit slotId fields/);
  assert.deepEqual(body.response_format.json_schema.schema.properties.slots.required,["card_0"]);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:review.showHeadline,opening:review.opening,closing:review.closing,
   slots:{card_0:{headline:review.slots[0]?.headline,recap:review.slots[0]?.recap}}
  })}}]}));
 };
 assert.equal((await generateGroqReview(show,"fixture",fake)).slots.length,1);
});

// History is injected as capped data, never an instruction to invent continuity.
test("verified history is optional, private, and does not change recorded card facts",async()=>{
 const memory={priorMatches:[{when:"Y1 W1",wrestlers:["Kenny Omega","Opponent"],
  winners:["Opponent"],finish:"FLASH_PIN"}],
  programmes:[{wrestlers:["Kenny Omega","Opponent"],began:"week index 0",
   beats:1,latest:"MATCH"}]};
 const transport:typeof fetch=async(_url,init)=>{
  const req=JSON.parse(String(init?.body));
  assert.match(req.messages[1].content,/HISTORY/);
  assert.match(req.messages[1].content,/Opponent/);
  assert.match(req.messages[0].content,/ONE decisive finish/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"A return to form",opening:"Old scores were noted.",
   closing:"The crowd got its money's worth.",
   slots:{card_0:{headline:"Omega gets the win",recap:"Omega connected with the One Winged Angel and took the clean pin."}}
  })}}]}));
 };
 const encounter={...show,entries:[{...show.entries[0]!,
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:12,
   sides:[["Kenny Omega"],["Opponent"]],winnerNames:["Kenny Omega"],
   championshipContested:false}}]};
 const result=await generateGroqReview(encounter,"fixture",transport,undefined,memory);
 assert.equal(result.slots[0]?.slotId,"m");
});

test("verbatim recap echoes are removed without another paid Groq generation",async()=>{
 let calls=0;
 const fetcher:typeof fetch=async()=>{
  calls++;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Omega prevails",opening:"The audience was ready.",
   closing:"The crowd went home talking.",
   slots:{card_0:{headline:"Omega with the win",recap:
    "Omega caught him in a storm of offence. The One Winged Angel ended the night.\n\nThe One Winged Angel ended the night. Nobody could argue with the result."}}
  })}}]}));
 };
 const result=await generateGroqReview(show,"fixture",fetcher);
 assert.equal(calls,1);
 assert.equal(result.slots[0]?.recap.match(/One Winged Angel ended/g)?.length,1);
});

test("AI Director routes small features separately without an extra request",async()=>{
 const {chooseGroqModel,groqResponseUsage,estimatedGroqTokens}=await import("../src/domain/ai-director.js");
 const {requestGroqEditorial}=await import("../src/db/groq-ai-director.js");
 assert.equal(chooseGroqModel("RINGSIDE"),"openai/gpt-oss-120b");
 assert.equal(chooseGroqModel("RINGSIDE","openai/gpt-oss-20b"),"openai/gpt-oss-20b");
 assert.equal(chooseGroqModel("SHORT_NEWS"),"openai/gpt-oss-20b");
 assert.equal(chooseGroqModel("CREATIVE_PITCH"),"openai/gpt-oss-20b");
 assert.equal(estimatedGroqTokens("x".repeat(300),100),200);
 assert.throws(()=>estimatedGroqTokens("x".repeat(85001),100),/bounded/);
 assert.deepEqual(groqResponseUsage({usage:{prompt_tokens:120,completion_tokens:40}}),
  {inputTokens:120,outputTokens:40});
 assert.equal(groqResponseUsage({usage:{prompt_tokens:-1,completion_tokens:40}}),null);
 let calls=0;
 const response=await requestGroqEditorial({task:"SHORT_NEWS",key:"test",
  body:{max_completion_tokens:200,messages:[]},transport:async(_url,init)=>{
   calls++;
   const payload=JSON.parse(String(init?.body));
   assert.equal(payload.model,"openai/gpt-oss-20b");
   assert.equal((init?.headers as Record<string,string>).authorization,"Bearer test");
   return new Response('{"usage":{"prompt_tokens":1,"completion_tokens":1}}');
  }});
 assert.equal(response.status,200);assert.equal(calls,1);
});

test("Groq receives tag legality and pacing as compact evidence, not extra requests",async()=>{
 const team:CompletedShowView={...show,entries:[{...show.entries[0]!,
  matchContext:{format:"2v2",intent:"COMPETITIVE",plannedMinutes:22,
   sides:[["Kenny Omega","Matt Jackson"],["Dax Harwood","Cash Wheeler"]],
   winnerNames:["Kenny Omega","Matt Jackson"],championshipContested:false},
  fallout:{ratingStars:4,actualMinutes:22,injuries:[],eliminations:[]}}]};
 let calls=0;
 const response:typeof fetch=async(_url,init)=>{
  calls++;
  const request=JSON.parse(String(init?.body));
  assert.match(request.messages[0].content,/only one wrestler PER TEAM is legal/);
  assert.match(request.messages[1].content,/"format":"TAG"/);
  assert.match(request.messages[1].content,/"tempo":"LONG"/);
  assert.match(request.messages[1].content,/"beat":"tag drama optional"/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"The big match",opening:"It felt like a genuine main event.",
   closing:"The team earned its victory.",
   slots:{card_0:{headline:"A tag-team test",recap:
    "The opponents worked the corner before Omega found a way back to the apron. A legal tag changed the momentum, and his team secured the certified clean pin."}}
  })}}]}));
 };
 const article=await generateGroqReview(team,"fixture",response);
 assert.equal(article.slots.length,1);assert.equal(calls,1);
});
test("Groq cannot publish a tag match where both team members remain legal",async()=>{
 const team:CompletedShowView={...show,entries:[{...show.entries[0]!,
  matchContext:{format:"2v2",intent:"COMPETITIVE",plannedMinutes:12,
   sides:[["Kenny Omega","Matt Jackson"],["Dax Harwood","Cash Wheeler"]],
   winnerNames:["Kenny Omega","Matt Jackson"],championshipContested:false}}]};
 let attempts=0;
 await assert.rejects(()=>generateGroqReview(team,"fixture",async()=>{
  attempts++;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"The tag bout",opening:"The action stayed brisk.",
   closing:"One team won.",
   slots:{card_0:{headline:"Wrong tag mechanics",
    recap:"Both team partners were legal from start to finish, with no tags required."}}
  })}}]}));
 }),error=>error instanceof RingsideGenerationError&&error.code==="FACT_VALIDATION");
 assert.equal(attempts,2);
});

test("OpenAI preview uses the same certified Ringside validator with mocked provider",async()=>{
 const team:CompletedShowView={...show,entries:[{...show.entries[0]!,
  matchContext:{format:"2v2",intent:"COMPETITIVE",plannedMinutes:12,
   sides:[["Kenny Omega","Matt Jackson"],["Dax Harwood","Cash Wheeler"]],
   winnerNames:["Kenny Omega","Matt Jackson"],championshipContested:false}}]};
 let requests=0;
 const pool={connect:async()=>({release(){},async query(sql:string){
  if(sql.includes("INSERT INTO ppw_openai_preview_daily_usage"))
   return [{day:"2026-11-07"}];
  return [];
 }})};
 const transport:typeof fetch=async(url,options)=>{
  requests++;
  assert.equal(url,"https://api.openai.com/v1/chat/completions");
  const body=JSON.parse(String(options?.body));
  assert.equal(body.model,"gpt-4o-mini");
  assert.equal(body.store,false);
  assert.ok(!Object.hasOwn(body,"reasoning_effort"));
  assert.equal(body.response_format.json_schema.strict,true);
  return new Response(JSON.stringify({usage:{prompt_tokens:300,completion_tokens:60},
   choices:[{message:{content:JSON.stringify({
    showHeadline:"Teams go to war",opening:"A hot crowd awaited.",
    closing:"A deserved team victory.",
    slots:{card_0:{headline:"Double trouble",
     recap:"Each side took turns controlling the corner until a legal tag sparked a comeback. The winners earned the official fall."}}
   })}}]}));
 };
 const article=await generateGroqReview(team,"fixture",transport,undefined,undefined,
  pool as never,"OPENAI");
 assert.match(article.showHeadline,/Teams/);
 assert.equal(requests,1);
});

test("Groq response headers report real account RPD and model TPM, never inferred quotas",async()=>{
 const {groqResponseLimits}=await import("../src/domain/ai-director.js");
 const actual=new Headers({
  "x-ratelimit-limit-requests":"1000",
  "x-ratelimit-remaining-requests":"978",
  "x-ratelimit-limit-tokens":"8000",
  "x-ratelimit-remaining-tokens":"5200"
 });
 assert.deepEqual(groqResponseLimits(actual),{
  dailyRequestLimit:1000,dailyRequestRemaining:978,
  minuteTokenLimit:8000,minuteTokenRemaining:5200
 });
 assert.equal(groqResponseLimits(new Headers()),null);
 actual.set("x-ratelimit-remaining-requests","1001");
 assert.equal(groqResponseLimits(actual),null);
 actual.set("x-ratelimit-remaining-requests","978");
 actual.set("x-ratelimit-remaining-tokens","impossible");
 assert.equal(groqResponseLimits(actual),null);
});

test("two-attempt Groq budget improves an over-written match rather than publishing stock prose",async()=>{
 let calls=0;
 const transport:typeof fetch=async (_url,init)=>{
  calls++;
  const body=JSON.parse(String(init?.body));
  if(calls===2)assert.match(body.messages[1].content,
   /Cut the melodrama/);
  const recap=calls===1?
   "The electric crowd watched a looming threat seize the canvas, before Omega captured a clean pinfall.":
   "Omega worked the opponent down, countered a late strike and secured the official pinfall with a legal cover.";
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Omega gets his victory",opening:"The house was ready.",
   closing:"The win kept Omega in the picture.",
   slots:{card_0:{headline:"Omega's clean decision",recap}}
  })}}]}));
 };
 const result=await generateGroqReview(show,"fixture",transport);
 assert.equal(calls,2,"One bounded editorial correction, never a paid third attempt");
 assert.match(result.slots[0]!.recap,/countered a late strike/);
 assert.doesNotMatch(result.slots[0]!.recap,/electric crowd|looming threat/);
});

test("read-only Groq inspector uses the identical provider payload and costs no request",async()=>{
 const settings={model:"openai/gpt-oss-120b" as const,voice:"MARTY" as const,
  detail:"BALANCED" as const,creativity:0.65,reasoning:"medium" as const,
  additionalGuidance:"Vary the rhythm",version:1};
 const inspected=inspectRingsidePrompt(show,settings);
 assert.equal(inspected.callMade,false);
 assert.equal(inspected.promptVersion,"ringside-v14");
 assert.equal(inspected.model,settings.model);
 assert.equal(inspected.temperature,0.65);
 assert.equal(inspected.reasoning_effort,"medium");
 assert.deepEqual(inspected.facts.slots.map((x:{key:string})=>x.key),["card_0"]);
 let requests=0;
 const transport:typeof fetch=async(_url,init)=>{
  requests++;
  const {model:_model,promptVersion:_version,facts:_facts,provider:_provider,
   callMade:_call,historyScope:_scope,...exact}=inspected;
  const sent=JSON.parse(String(init?.body));
  assert.deepEqual(sent,{...exact,model:settings.model},
   "Inspector request and actual Groq request must remain identical");
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:review.showHeadline,opening:review.opening,closing:review.closing,
   slots:{card_0:{headline:review.slots[0]!.headline,recap:review.slots[0]!.recap}}
  })}}]}));
 };
 assert.equal(requests,0,"Inspection must not generate any tokens");
 await generateGroqReview(show,"fixture",transport,settings);
 assert.equal(requests,1);
});
test("inspector shows 20B fictional fixture JSON compatibility without a provider call",()=>{
 const settings={model:"openai/gpt-oss-20b" as const,voice:"MARTY" as const,
  detail:"BALANCED" as const,creativity:1.05,reasoning:"high" as const,
  additionalGuidance:"",version:0};
 const inspected=inspectRingsidePrompt(show,settings,undefined,true);
 assert.equal(inspected.response_format.type,"json_object");
 assert.equal(inspected.reasoning_effort,"high");
 assert.equal(inspected.temperature,1.05);
 assert.match(inspected.messages[1]!.content,/No extra prose or markdown/);
});
test("AI Lab trace preserves original Groq prose and identifies PPW cleaning",async()=>{
 const trace:{attempts:import("../src/db/ringside-commentary.js").RingsideGenerationTrace["attempts"];
  slotOrigins:import("../src/db/ringside-commentary.js").RingsideGenerationTrace["slotOrigins"]}=
  {attempts:[],slotOrigins:[]};
 const transport:typeof fetch=async()=>new Response(JSON.stringify({choices:[{
  message:{content:JSON.stringify({
   showHeadline:"The main event",opening:"The crowd settled in.",closing:"A clean result.",
   slots:{card_0:{headline:"Omega prevails",recap:
    "Omega took control and earned the pinfall.\n\nOmega took control and earned the pinfall."}}
  })}}]}));
 const result=await generateGroqReview(show,"fixture",transport,undefined,
  undefined,undefined,"GROQ",false,trace);
 assert.equal(trace.attempts.length,1);
 assert.equal(trace.attempts[0]?.status,"ACCEPTED");
 assert.match(trace.attempts[0]!.draft.slots[0]!.recap,/\n\nOmega took control/);
 assert.equal(trace.slotOrigins[0]?.source,"CLEANED");
 assert.notEqual(trace.attempts[0]!.draft.slots[0]!.recap,result.slots[0]!.recap);
});


test("Groq 400 strict schema recovery reuses exactly the existing second attempt",async()=>{
 let calls=0;
 const fetcher:typeof fetch=async(_url,init)=>{
  calls++;
  const body=JSON.parse(String(init?.body));
  assert.equal(body.model,"openai/gpt-oss-120b");
  assert.equal(body.reasoning_effort,"low");
  assert.ok(!Object.hasOwn(body,"reasoning_format"),
   "GPT-OSS does not accept reasoning_format");
  assert.match(body.messages[1].content,/One Winged Angel/);
  if(calls===1){
   assert.equal(body.response_format.type,"json_schema");
   assert.equal(body.response_format.json_schema.strict,true);
   return new Response(JSON.stringify({error:{
    type:"invalid_request_error",param:"response_format",
    message:"Invalid schema for response_format"
   }}),{status:400});
  }
  assert.equal(body.response_format.type,"json_object");
  assert.match(body.messages[1].content,/Quality-control correction required/);
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:review.showHeadline,opening:review.opening,closing:review.closing,
   slots:{card_0:{headline:review.slots[0]!.headline,recap:review.slots[0]!.recap}}
  })}}]}));
 };
 const article=await generateGroqReview(show,"fixture",fetcher);
 assert.equal(article.slots[0]?.slotId,"m");
 assert.equal(calls,2);
});

test("An unknown provider 400 gets one compatible JSON attempt, never a third",async()=>{
 let calls=0;
 const fake:typeof fetch=async(_url,init)=>{
  calls++;
  const body=JSON.parse(String(init?.body));
  assert.equal(body.response_format.type,calls===1?"json_schema":"json_object");
  return new Response("Bad Request",{status:400});
 };
 await assert.rejects(()=>generateGroqReview(show,"fixture",fake),
  e=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_ERROR"&&
   /including its compatibility format/.test(e.message));
 assert.equal(calls,2);
});

test("Known invalid model parameters fail safely without retrying or leaking raw provider text",async()=>{
 let calls=0;
 const secretLikeDetail="DO_NOT_EXPOSE_PRIVATE_PROVIDER_FRAGMENT";
 const fake:typeof fetch=async()=>{
  calls++;
  return new Response(JSON.stringify({error:{
   type:"invalid_request_error",param:"reasoning_effort",
   message:"Unsupported reasoning_effort "+secretLikeDetail
  }}),{status:400});
 };
 await assert.rejects(()=>generateGroqReview(show,"fixture",fake),
  e=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_ERROR"&&
   /model or reasoning parameter/.test(e.message)&&
   !e.message.includes(secretLikeDetail));
 assert.equal(calls,1);
});

test("Fictional 20B JSON mode omits unsupported reasoning_format",async()=>{
 const settings={model:"openai/gpt-oss-20b" as const,voice:"MARTY" as const,
  detail:"BALANCED" as const,creativity:1,reasoning:"medium" as const,
  additionalGuidance:"",version:0};
 const payload=inspectRingsidePrompt(show,settings,undefined,true);
 assert.equal(payload.response_format.type,"json_object");
 assert.equal(Object.hasOwn(payload,"reasoning_format"),false);
});


test("Nine-card 120B Groq preview and read-only inspector use one compatible request",async()=>{
 const nine:CompletedShowView={...show,showId:"w29-ascension-preview",
  entries:Array.from({length:9},(_,i)=>({
   ...show.entries[0]!,slotId:"ascension-"+i,position:i,
   headline:"Ascension match "+(i+1)
  })),matchCount:9,angleCount:0};
 const inspected=inspectRingsidePrompt(nine);
 assert.equal(inspected.callMade,false);
 assert.equal(inspected.response_format.type,"json_object");
 assert.deepEqual(inspected.facts.slots.map((s:{key:string})=>s.key),
  Array.from({length:9},(_,i)=>"card_"+i));
 let calls=0;
 const result=await generateGroqReview(nine,"fixture",async(_url,init)=>{
  calls++;
  const body=JSON.parse(String(init?.body));
  assert.equal(body.model,"openai/gpt-oss-120b");
  assert.equal(body.response_format.type,"json_object");
  assert.equal(body.response_format.json_schema,undefined);
  assert.match(body.messages[1].content,/Return ONLY one JSON object/);
  assert.equal(body.max_completion_tokens,2965);
  assert.equal(body.reasoning_effort,inspected.reasoning_effort);
  assert.deepEqual(body.response_format,inspected.response_format);
  const distinctRecaps=[
   "Omega ducked a wild opening shot, established control with sharp counters and took the clean pin.",
   "A test of patience saw Omega wrestle out of trouble before a legal cover secured his win.",
   "Early exchanges rewarded the opponent's aggression, but Omega found room to recover and earn the three-count.",
   "The battle around the ropes turned scrappy until Omega adjusted his footing and scored the pinfall.",
   "Rather than rush into a brawl, Omega picked his moment and converted the opening into a legal pin.",
   "An opponent's late rally briefly threatened the decision; Omega answered it with a clean cover.",
   "This contest grew tense with every counter, although Omega ultimately kept his composure to win by pinfall.",
   "Two determined wrestlers traded momentum across the ring before Omega finally put a shoulder down for three.",
   "The final stretch demanded careful timing and Omega responded decisively, collecting the official clean victory."
  ];
  const slots=Object.fromEntries(nine.entries.map((_,i)=>[
   "card_"+i,{headline:"Omega's match "+(i+1),
    recap:distinctRecaps[i]!}]));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Nine bouts of Ascension",opening:"CWA had an eventful night.",
   closing:"The card ended with the certified results intact.",slots
  })}}]}),{status:200});
 });
 assert.equal(calls,1,"No wasted strict-schema attempt or immediate rate-limit retry");
 assert.equal(result.slots.length,9);
 assert.deepEqual(result.slots.map(s=>s.slotId),nine.entries.map(e=>e.slotId));
});

test("Nine-card 120B provider cooldown uses only one call and retains retry-after",async()=>{
 const nine:CompletedShowView={...show,entries:Array.from({length:9},(_,i)=>({
  ...show.entries[0]!,slotId:"m"+i,position:i
 }))};
 let calls=0;
 await assert.rejects(()=>generateGroqReview(nine,"fixture",async(_url,init)=>{
  calls++;
  const req=JSON.parse(String(init?.body));
  assert.equal(req.response_format.type,"json_object");
  return new Response("",{status:429,headers:{"retry-after":"24"}});
 }),e=>e instanceof RingsideGenerationError&&e.code==="PROVIDER_LIMIT"&&
  e.retryAfterSeconds===24);
 assert.equal(calls,1);
});


test("W29-sized Groq draft with private card labels is cleaned, validated and published on ONE provider call",async()=>{
 const nine:CompletedShowView={...show,showId:"metadata-ascension-w29",
  entries:Array.from({length:9},(_,i)=>({
   ...show.entries[0]!,slotId:"original-card-"+i,position:i
  })),matchCount:9,angleCount:0};
 const distinctive=[
  "Omega started cautiously, slipped an early attack and won the opening contest by a clean cover.",
  "The challenger found the better rhythm initially, but Omega countered a late flurry for three.",
  "Pace dictated the early exchanges until Omega recovered and earned a legal pinfall.",
  "A hard scramble on the ropes ended when Omega escaped and collected the official victory.",
  "Neither wrestler could settle the tempo before Omega seized a gap for the clean three-count.",
  "The crowd watched a measured exchange of counters, with Omega finally finding the winning pin.",
  "An early stretch of control faded when Omega adjusted his strategy and pinned his opponent.",
  "The difficult middle portion rewarded Omega's patience, and a decisive cover settled the bout.",
  "Late pressure had Omega in trouble, yet his sharp final counter brought another clean decision."
 ];
 let calls=0;
 const trace:{attempts:import("../src/db/ringside-commentary.js").RingsideGenerationTrace["attempts"];
  slotOrigins:import("../src/db/ringside-commentary.js").RingsideGenerationTrace["slotOrigins"]}=
  {attempts:[],slotOrigins:[]};
 const generated=await generateGroqReview(nine,"fixture",async(_url,init)=>{
  calls++;
  const body=JSON.parse(String(init?.body));
  assert.equal(body.response_format.type,"json_object");
  const slots=Object.fromEntries(distinctive.map((recap,i)=>[
   "card_"+i,{headline:i===7?"card_7 saw Omega survive":"Omega wins again "+i,
    recap:i===5?"In card_5, "+recap:recap}
  ]));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({
   showHeadline:"Ascension changes the landscape",
   opening:"Week 29 brought nine tense contests before the final bell.",
   closing:"The show ended with fresh questions for the challengers.",slots
  })}}]}),{status:200});
 },undefined,undefined,undefined,"GROQ",false,trace);
 assert.equal(calls,1,"Private label echoes should never consume an immediate second request");
 assert.equal(trace.attempts.length,1);
 assert.equal(trace.attempts[0]?.status,"RECOVERED");
 assert.equal(trace.slotOrigins[7]?.source,"CLEANED");
 assert.equal(trace.slotOrigins[5]?.source,"CLEANED");
 assert.match(generated.slots[7]!.headline,/match saw Omega survive/);
 assert.match(generated.slots[5]!.recap,/In the match,/);
 assert.doesNotMatch(JSON.stringify(generated),/card[_\s-]*\d+|slot[_\s-]*\d+|week\s+\d+/i);
 assert.equal(generated.slots.length,9);
 assert.deepEqual(generated.slots.map(s=>s.slotId),nine.entries.map(e=>e.slotId));
});

test("Metadata cleaning NEVER licenses a false finish or title claim",async()=>{
 const {cleanRingsidePrivateMetadata}=await import("../src/domain/ringside-editorial.js");
 const unsafe={...review,opening:"Week 29 had a tense crowd.",
  slots:[{...review.slots[0]!,
   recap:"In card_0, Omega won by submission rather than the certified clean pin."}]};
 assert.equal(cleanRingsidePrivateMetadata(unsafe,show),null,
  "Removing private labels must still enforce the certified clean pin");
 const safe={...review,opening:"Week 29 had a tense crowd.",
  slots:[{...review.slots[0]!,
   recap:"In card_0, Omega nailed a V-Trigger and the One Winged Angel."}]};
 const cleaned=cleanRingsidePrivateMetadata(safe,show);
 assert.ok(cleaned);
 assert.doesNotMatch(JSON.stringify(cleaned),/card[_\s-]*\d+|week\s+\d+/i);
 assert.match(cleaned!.slots[0]!.recap,/V-Trigger and the One Winged Angel/);
});
