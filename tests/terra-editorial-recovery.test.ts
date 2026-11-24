import {test} from "node:test";
import assert from "node:assert/strict";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
import {finalizeTerraEditorial,restoreTerraAuthoredDialogue} from "../src/domain/terra-editorial-recovery.js";
import {validateRingsideCopy,type RingsideCopy} from "../src/domain/ringside-editorial.js";
import {generateGroqReview,type RingsideGenerationTrace} from "../src/db/ringside-commentary.js";
import {validateTerraDiagnostics,isAssistedTerra} from "../src/domain/terra-editorial-diagnostics.js";
// Reproduces the live W29 topology: debut, three-way flash pin, offscreen
// promo, singles pin, multi-speaker interview, submission, video, belt
// controversy, closing interview. Synthetic names/lines, no private IDs.
function angle(i:number,kind:string,name:string,line?:string,target?:string):ShowResultEntry{
 return {slotId:"angle-"+i,position:i,type:"SEGMENT",headline:name+" on the show",
  summary:name+" appeared in a "+kind.toLowerCase(),outcome:"HAPPENS",crowdResponse:80,
  actorIds:["a"+i],targetIds:target?["t"+i]:[],segmentKind:kind,
  segmentContext:{actorNames:[name],targetNames:target?[target]:[],targetPresence:target?"MENTIONED":null,
   videoPurpose:kind==="VIDEO_PACKAGE"?"PROMOTE_EVENT":null,stableDecision:null,
   turnTargetAlignment:null,scriptedActions:line?[{action:"SPEAK",by:"a"+i,line}]:[]}};
}
function match(i:number,winner:string,losers:string[],finish:string):ShowResultEntry{
 return {slotId:"match-"+i,position:i,type:"MATCH",headline:winner+" prevails",
  summary:winner+" wins",outcome:finish,crowdResponse:76,actorIds:[],targetIds:[],
  matchContext:{format:losers.length>1?"TRIPLE_THREAT":"SINGLES",intent:"COMPETITIVE",
   plannedMinutes:12,sides:[[winner],...losers.map(n=>[n])],winnerNames:[winner],
   championshipContested:finish==="FOREIGN_OBJECT"},
  fallout:{ratingStars:3.5,actualMinutes:12,injuries:[],eliminations:[]}};
}
const regalLine="That’s right, ladies and gentlemen. I’ve arrived to deal with these scallywags.";
const show:CompletedShowView={showId:"ascension-regression",showName:"Ascension",year:1,week:29,
 promotionName:"CWA",crowdResponse:76,matchCount:4,angleCount:5,entries:[
 angle(0,"DEBUT","William Regal",regalLine),
 match(1,"Parker",["Jones","King"],"FLASH_PIN"),
 angle(2,"PROMO","Joe","I’ll see you in the ring.","Místico"),
 match(3,"Reed",["Ellis"],"CLEAN_PIN"),
 angle(4,"INTERVIEW","Lane","I’m not sure you belong here."),
 match(5,"Joe",["Smith"],"SUBMISSION"),
 angle(6,"VIDEO_PACKAGE","Mr Perfect"),
 match(7,"Morgan",["William Regal"],"FOREIGN_OBJECT"),
 angle(8,"INTERVIEW","Undertaker","I’m coming for the championship. Rest in peace.")
 ]};
const matchRecaps=[
 "Parker recognised that the next exchange mattered more than controlling the pace. With three wrestlers in contention the contest became increasingly frantic. Nobody could afford a lengthy celebration after a counter. Parker capitalised on the opening and stole a sudden pinfall. The finish rewarded alertness rather than overwhelming dominance, and the crowd stayed involved until the bell.",
 "Reed kept Ellis working at a pace that suited neither wrestler for long. The early exchanges established a genuinely competitive rhythm, with both looking for an opening rather than rushing to the finish. Reed eventually found the decisive advantage and secured a clean pinfall. This was a solid contest whose outcome felt earned rather than inevitable.",
 "Joe made patience count as Smith tried to find room to manoeuvre. The tension came from the prospect of a hold changing the contest, not from a frantic sequence of near falls. The longer the struggle went on, the more important position became. Joe secured a submission victory, a convincing conclusion to an absorbing struggle.",
 "Morgan and Regal offered a more contentious spectacle. The exchanges mattered, but it was the controversy around the finish that left the crowd with something to debate. Morgan emerged victorious after concealed cheating, a decision that hardly settled the question of superiority. It was an effective ending if the aim was to keep people talking."
];
function draft():RingsideCopy{
 return {showHeadline:"A debut and a disputed decision",opening:"Ascension offered a lively mix of competition and character.",
 closing:"The last interview provided a compelling note to finish on.",
 slots:show.entries.map((e,i)=>({slotId:e.slotId,headline:e.headline,recap:
 i%2?matchRecaps[(i-1)/2]!:
 i===0?"Regal announced his arrival and said, “"+regalLine+"” The reception made it a notable introduction.":
 i===2?"Joe addressed Místico without a confrontation. The response made the promo an effective change of pace.":
 i===4?"Lane questioned the opposition's place in the promotion. The interview gave the audience something to consider.":
 i===6?"The package put Mr Perfect in focus and sold the prospect of the next event.":
 "Undertaker closed the broadcast by setting his sights on the championship. That ambition had the crowd's attention."
 }))};
}
test("Full nine-slot paid article restores typography and preserves other model recaps",()=>{
 const raw=draft();raw.slots[0]!.recap="Regal said, “That's right ladies and gentlemen. I've arrived to deal with these scallywags.” His arrival drew attention.";
 assert.throws(()=>validateRingsideCopy(raw,show),/quotation/);
 const out=finalizeTerraEditorial(raw,show);
 assert.equal(out.review.slots.length,9);
 assert.ok(out.review.slots[0]!.recap.includes(regalLine));
 assert.equal(out.diagnostics.slots[0]?.source,"CLEANED");
 for(let i=1;i<9;i++)assert.equal(out.review.slots[i]!.headline,raw.slots[i]!.headline);
 assert.equal(isAssistedTerra(out.diagnostics),false);
 validateTerraDiagnostics(out.diagnostics,show.entries.map(e=>e.slotId));
 validateRingsideCopy(out.review,show,{styleWarningOnly:true});
});
test("An invented short quote is replaced, leaving the eight other cards intact",()=>{
 const raw=draft();raw.slots[2]!.recap='Joe shouted, “You are fired!”';
 const out=finalizeTerraEditorial(raw,show);
 assert.equal(out.diagnostics.slots[2]?.source,"PPW_FALLBACK");
 assert.ok(out.review.slots[2]!.recap.includes("I’ll see you in the ring."));
 assert.doesNotMatch(out.review.slots[2]!.recap,/fired/);
 assert.equal(out.diagnostics.slots.filter(s=>s.source==="PPW_FALLBACK").length,1);
 assert.equal(isAssistedTerra(out.diagnostics),true);
 for(let i=0;i<9;i++)if(i!==2)assert.equal(out.review.slots[i]!.headline,raw.slots[i]!.headline);
});
test("Multiple independent local defects are repaired together, not wholesale rewritten",()=>{
 const raw=draft();raw.slots[0]!.recap='Regal promised, “I will retire every wrestler in the company tonight.”';
 raw.slots[3]!.recap="Ellis defeated Reed by submission.";
 raw.slots[6]!.headline="card 6 — Mr Perfect";
 const out=finalizeTerraEditorial(raw,show);
 assert.equal(out.diagnostics.slots[0]?.source,"PPW_FALLBACK");
 assert.equal(out.diagnostics.slots[3]?.source,"PPW_FALLBACK");
 assert.equal(out.diagnostics.slots[6]?.source,"CLEANED");
 assert.doesNotMatch(out.review.slots[3]!.recap,/submission/);
 assert.ok(out.diagnostics.warnings.includes("UNDERWRITTEN_MATCH"));
 validateRingsideCopy(out.review,show,{styleWarningOnly:true});
});
test("Never call three broken cards a successful paid article, or accept wrong order",()=>{
 const raw=draft();
 for(const i of [0,2,4])raw.slots[i]!.recap='“I promise to retire everyone.”';
 assert.throws(()=>finalizeTerraEditorial(raw,show),/bounded factual repair/);
 const swapped=draft();swapped.slots.reverse();
 assert.throws(()=>finalizeTerraEditorial(swapped,show),/order/);
});
test("Style concerns remain visible in private lab, not a reason to buy another article",()=>{
 const raw=draft();
 raw.slots[1]!.recap="Parker snatched a sudden pinfall.";
 const out=finalizeTerraEditorial(raw,show);
 assert.ok(out.diagnostics.warnings.includes("UNDERWRITTEN_MATCH"));
 assert.equal(out.diagnostics.slots[1]?.source,"OPENAI");
});
test("Full generation path completes one paid request and exposes correct provenance",async()=>{
 const raw=draft();raw.slots[0]!.recap='Regal declared, “I will destroy everybody in this company.”';
 const trace:RingsideGenerationTrace={attempts:[],slotOrigins:[]};
 let calls=0;
 const pool={connect:async()=>({release(){},async query(sql:string){
  if(sql.includes("INSERT INTO ppw_openai_preview_daily_usage"))return [{day:"2026-11-24"}];
  if(sql.includes("INSERT INTO ppw_openai_preview_monthly_usage"))return [{month:"2026-11-01"}];
  return [];
 }})};
 const review=await generateGroqReview(show,"fixture",async(_url,init)=>{
  calls++;
  const request=JSON.parse(String(init?.body));
  assert.match(request.messages[0].content,/copy a complete line verbatim/);
  const slots=Object.fromEntries(raw.slots.map((s,i)=>["card_"+i,{headline:s.headline,recap:s.recap}]));
  return new Response(JSON.stringify({usage:{prompt_tokens:5257,completion_tokens:1450},
   choices:[{finish_reason:"stop",message:{content:JSON.stringify({...raw,slots})}}]}));
 },undefined,undefined,pool as never,"OPENAI",false,trace);
 assert.equal(calls,1);assert.equal(review.slots.length,9);
 assert.equal(trace.terraEditorial?.slots[0]?.source,"PPW_FALLBACK");
 assert.equal(trace.attempts[0]?.status,"RECOVERED");
});
test("Typography repair is literal and refuses changed words",()=>{
 const entry=show.entries[0]!;
 assert.equal(restoreTerraAuthoredDialogue('“I am the champion.”',entry).unsupported,true);
 assert.equal(restoreTerraAuthoredDialogue("Regal’s debut",entry).unsupported,false);
});
