/** Deterministic, fictional PPW fixtures for reproducible wrestling literacy
 * comparisons. No player save, simulated World event, Groq call or SQL read.
 * Hard match facts are deliberately independent of any provider response.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import {ringsideBrief,ringsideStipulationNote,validateRingsideCopy,type RingsideCopy}
 from "./ringside-editorial.js";
import {wrestlingMatchIQ} from "./wrestling-iq.js";

export interface WrestlingBenchmarkScenario{
 id:string;name:string;focus:string;expectation:string;watchFor:string;
}
export const WRESTLING_BENCHMARKS:readonly WrestlingBenchmarkScenario[]=[
 {id:"singles-technical",name:"Singles · technical classic",
  focus:"A 24-minute, highly rated clean-pin singles contest",
  expectation:"Pacing, counters, selling and a plausible clean three-count",
  watchFor:"A generic brawl, impossible legal rules, invented title wins or constant finishers"},
 {id:"singles-squash",name:"Singles · four-minute squash",
  focus:"A brief, one-sided main-event mismatch",
  expectation:"A convincing dominant performance and brief, appropriate closing sequence",
  watchFor:"An epic thirty-minute narrative or an unearned back-and-forth classic"},
 {id:"singles-submission",name:"Singles · submission victory",
  focus:"One wrestler wins through a conventional submission",
  expectation:"Escapes, pressure, rope awareness and the certified submission decision",
  watchFor:"A decisive pinfall or a made-up injury"},
 {id:"tag-standard",name:"Tag · conventional 2v2",
  focus:"Eighteen minutes, four wrestlers, a verified winning team",
  expectation:"Only legal partners contest the fall; logical tags and optional isolation",
  watchFor:"Both partners permanently legal or an invented individual fall scorer"},
 {id:"tag-squash",name:"Tag · dominant 2v2 squash",
  focus:"A four-minute dominant tag-team victory",
  expectation:"Tight control of the legal competitor without forcing a hot-tag comeback",
  watchFor:"An automatic dramatic hot tag in a match too short to support it"},
 {id:"trios",name:"Trios · 3v3",
  focus:"Six wrestlers across two legal tag teams",
  expectation:"Corners, legal exchanges and escalating teamwork",
  watchFor:"All six simultaneously eligible to make the match-winning fall"},
 {id:"multi-team",name:"Multi-team · 2v2v2",
  focus:"Three tag teams share a single multi-team bout",
  expectation:"Respect team tagging, changing momentum and an unambiguous winning team",
  watchFor:"Unverified elimination or a fabricated mandatory rotation rule"},
 {id:"triple-threat",name:"Triple threat",
  focus:"Three individual competitors, all legal at once",
  expectation:"Interrupted falls, ring positioning and no tags",
  watchFor:"A non-existent partner tag, invented elimination or fabricated DQ"},
 {id:"steel-cage",name:"Steel Cage · singles",
  focus:"A 23-minute cage main event decided by pinfall",
  expectation:"Steel walls, constrained space and an actual pin inside the cage",
  watchFor:"Cage escape presented as a winning method"},
 {id:"i-quit",name:"I Quit · verbal surrender",
  focus:"An intense match that ends only with spoken surrender",
  expectation:"Escalating holds, a referee microphone and the opponent's verbal concession",
  watchFor:"A tap-out, pinfall or automatic weapon use presented as the finish"},
 {id:"iron-man",name:"Iron Man · thirty minutes",
  focus:"A thirty-minute contest decided by the most falls",
  expectation:"Clock management, stamina and cumulative falls without an invented score",
  watchFor:"One standard fall presented as winning the whole match"},
 {id:"two-falls",name:"Two out of Three Falls",
  focus:"The deciding second fall ends a technical contest",
  expectation:"Tactical shifts, rising stakes and a verified second fall",
  watchFor:"Made-up detailed scores or a single fall ending everything"},
 {id:"battle-royal",name:"Battle Royal · final survivor",
  focus:"Ten wrestlers competing through over-the-top-rope elimination",
  expectation:"Rope survival, temporary alliances and the certified winner",
  watchFor:"A three-count finish or an invented sequence of eliminations"},
 {id:"disqualification",name:"Singles · controversial DQ",
  focus:"A heel is disqualified and the opponent gets the recorded win",
  expectation:"The referee's authority and an appropriately disputed non-pin finish",
  watchFor:"A clean three-count, an undisclosed weapon or an invented outsider"},
 {id:"poor-contest",name:"Singles · poor 22-minute match",
  focus:"Long match, low rating and a flat crowd",
  expectation:"An honest critical review without saying it was a classic",
  watchFor:"Automatic standing ovations, five-star praise or a made-up serious injury"}
] as const;
type MatchFixture={
 names:string[][];winner:string[];format:string;finish:string;duration:number;
 stars:number;crowd:number;summary:string;
};
const matches:Record<string,MatchFixture>={
 "singles-technical":{names:[["Rowan Pierce"],["Kira Vale"]],winner:["Rowan Pierce"],
  format:"SINGLES",finish:"CLEAN_PIN",duration:24,stars:4.5,crowd:94,
  summary:"Rowan Pierce defeated Kira Vale with a clean pin after a long technical contest."},
 "singles-squash":{names:[["Darius Stone"],["Leo Finch"]],winner:["Darius Stone"],
  format:"SINGLES",finish:"CLEAN_PIN",duration:4,stars:1.5,crowd:64,
  summary:"Darius Stone dominated Leo Finch and won by pinfall in four minutes."},
 "singles-submission":{names:[["Nadia Cross"],["Mika Storm"]],winner:["Nadia Cross"],
  format:"SINGLES",finish:"SUBMISSION",duration:15,stars:3.75,crowd:83,
  summary:"Nadia Cross made Mika Storm submit in a standard singles match."},
 "tag-standard":{names:[["Rey Sol","Marcus Drake"],["Niko Vega","Troy Bishop"]],
  winner:["Rey Sol","Marcus Drake"],format:"2v2",finish:"CLEAN_PIN",duration:18,stars:3.75,crowd:82,
  summary:"Rey Sol and Marcus Drake won by pinfall over Niko Vega and Troy Bishop; the individual fall scorer was not recorded."},
 "tag-squash":{names:[["The Blades' Ace","The Blades' Jett"],["Ryan Hale","Owen Ford"]],
  winner:["The Blades' Ace","The Blades' Jett"],format:"2v2",finish:"CLEAN_PIN",duration:4,stars:2,crowd:62,
  summary:"The Blades controlled a short contest and defeated Ryan Hale and Owen Ford by pinfall."},
 trios:{names:[["Nico Steel","Jade Cross","Max Atlas"],["Rex Ward","Ivy Flame","Tess North"]],
  winner:["Nico Steel","Jade Cross","Max Atlas"],format:"3v3",finish:"CLEAN_PIN",duration:21,stars:4,crowd:88,
  summary:"Nico Steel, Jade Cross and Max Atlas won a conventional trios tag match by pinfall."},
 "multi-team":{names:[["Kai Rhodes","Alex Sharp"],["Brett West","Drew King"],["Luis Nova","Eli Black"]],
  winner:["Luis Nova","Eli Black"],format:"2v2v2",finish:"CLEAN_PIN",duration:18,stars:3.25,crowd:79,
  summary:"Luis Nova and Eli Black prevailed in a non-elimination three-team tag match; the fall scorer and entry rotation were not recorded."},
 "triple-threat":{names:[["Anton Reed"],["Bishop Gray"],["Silas Cain"]],
  winner:["Silas Cain"],format:"TRIPLE THREAT",finish:"CLEAN_PIN",duration:17,stars:4.25,crowd:89,
  summary:"Silas Cain defeated Anton Reed and Bishop Gray in a three-way bout by pinfall."},
 "steel-cage":{names:[["Mason Holt"],["Isaiah King"]],winner:["Mason Holt"],
  format:"Steel Cage · SINGLES",finish:"CLEAN_PIN",duration:23,stars:4.25,crowd:90,
  summary:"Mason Holt pinned Isaiah King inside the cage; escape was not a winning condition."},
 "i-quit":{names:[["Jett Mercer"],["Ronan Wolfe"]],winner:["Jett Mercer"],
  format:"I Quit Match · SINGLES",finish:"VERBAL_SURRENDER",duration:25,stars:4,crowd:91,
  summary:"Ronan Wolfe audibly said I quit, conceding victory to Jett Mercer. No other winning method applies."},
 "iron-man":{names:[["Aria Frost"],["Cleo James"]],winner:["Aria Frost"],
  format:"Iron Man Match · SINGLES",finish:"MOST_FALLS",duration:30,stars:4.5,crowd:93,
  summary:"Aria Frost won a thirty-minute Iron Man contest by recording more falls at the time limit; the precise score is not public."},
 "two-falls":{names:[["Lena Park"],["Kara Rivers"]],winner:["Kara Rivers"],
  format:"Two out of Three Falls · SINGLES",finish:"SECOND_FALL",duration:27,stars:4,crowd:85,
  summary:"Kara Rivers took the deciding second fall of a two-out-of-three-falls match; earlier fall details were not recorded."},
 "battle-royal":{names:Array.from({length:10},(_,i)=>["Wrestler "+String(i+1)]),
  winner:["Wrestler 3"],format:"BATTLE ROYAL",finish:"OVER_THE_TOP_ROPE",
  duration:26,stars:3,crowd:80,
  summary:"Wrestler 3 was the final survivor of a ten-person over-the-top-rope battle royal; other eliminations are not in the official record."},
 disqualification:{names:[["Selena Ward"],["Luna Blaze"]],winner:["Selena Ward"],
  format:"SINGLES",finish:"DISQUALIFICATION",duration:11,stars:2.25,crowd:69,
  summary:"Selena Ward defeated Luna Blaze by the referee's disqualification decision, not a legal pinfall."},
 "poor-contest":{names:[["Hector Voss"],["Eric Marsh"]],winner:["Hector Voss"],
  format:"SINGLES",finish:"CLEAN_PIN",duration:22,stars:1.25,crowd:31,
  summary:"Hector Voss pinned Eric Marsh cleanly after an awkward, flatly received twenty-two-minute contest."}
};
export function getWrestlingBenchmark(id:string):{
 scenario:WrestlingBenchmarkScenario;show:CompletedShowView}|null{
 const scenario=WRESTLING_BENCHMARKS.find(s=>s.id===id),m=matches[id];
 if(!scenario||!m)return null;
 const entry:ShowResultEntry={
  slotId:"benchmark-main-event",position:0,type:"MATCH",headline:scenario.name,
  summary:m.summary,outcome:m.finish,crowdResponse:m.crowd,
  actorIds:m.names.flat().map((_,i)=>"fixture-"+i),targetIds:[],
  matchContext:{
   format:m.format,intent:m.stars>=4?"EPIC":m.stars<=2?"STORY":"COMPETITIVE",
   plannedMinutes:m.duration,sides:m.names.map(team=>[...team]),
   winnerNames:[...m.winner],championshipContested:false
  },
  fallout:{ratingStars:m.stars,actualMinutes:m.duration,injuries:[],eliminations:[]},
  performerIdentities:m.names.flat().slice(0,6).map((name,i)=>({
   personId:"fixture-"+i,ringName:name,
   character:i%3===0?"COLD-BLOODED TECHNICIAN":i%3===1?"FIERY UNDERDOG":"COCKY HEEL",
   style:i%2?"HIGH_FLYER":"TECHNICAL",signatureMoves:[],finishingMoves:[],
   source:"WORLD_RECORD" as const
  }))
 };
 return {scenario,show:{
  showId:"benchmark:"+scenario.id,showName:"Ringside Benchmark · "+scenario.name,
  promotionName:"PPW Quality Lab",bookingClass:"REGULAR",
  year:1,week:1,crowdResponse:m.crowd,matchCount:1,angleCount:0,entries:[entry]
 }};
}
/** A conservative, transparent assessor. It identifies certified-result safety
 * and whether the writing mentions a relevant wrestling mechanic. A 'CUE'
 * is never a pass/fail claim about actual writing quality. Human rating is
 * mandatory for realistic psychology, humour, voice and narrative freshness.
 */
export function assessWrestlingBenchmark(id:string,copy:RingsideCopy){
 const sample=getWrestlingBenchmark(id);
 if(!sample)throw new Error("Unknown wrestling benchmark");
 const {show,scenario}=sample;
 validateRingsideCopy(copy,show);
 const entry=show.entries[0]!,iq=wrestlingMatchIQ(entry);
 const text=(copy.slots[0]?.headline??"")+" "+(copy.slots[0]?.recap??"");
 const rule=ringsideStipulationNote(entry.matchContext!.format);
 const cues:string[]=[];
 if(iq?.format==="TAG"||iq?.format==="MULTI_TEAM"){
  if(/\b(?:tag|tagging|corner|apron|legal (?:man|partner|wrestler)|isolation|cut (?:the )?ring)\b/i.test(text))
   cues.push("Some tag-team mechanics mentioned");
 }
 if(rule?.stipulation==="I_QUIT"){
  if(/\b(?:quit|verbal|concede|surrender|microphone)\b/i.test(text))
   cues.push("Verbal surrender language appears");
  if(/\b(?:microphone|referee.{0,35}(?:ask|demand)|mic\b)/i.test(text))
   cues.push("Referee's surrender question is dramatized");
  if(/\b(?:refus(?:e|ed|al)|defian(?:t|ce)|wouldn.t quit|won.t quit|not giv(?:e|ing) (?:in|up)|still resist|kept fighting)\b/i.test(text))
   cues.push("Resistance before surrender is described");
  if(/\b(?:painful|agony|agonis(?:ing|ed)|agoniz(?:ing|ed)|torqu(?:e|ed)|crank(?:ed|ing)?|wrench(?:ed|ing)?|twist(?:ed|ing)?|pressure|punish(?:ed|ment)|battered|brutal)\b/i.test(text))
   cues.push("Escalating physical pressure is described");
 }
 if(rule?.stipulation==="STEEL_CAGE"){
  if(/\b(?:cage|mesh|steel wall|chain.link)\b/i.test(text))
   cues.push("Cage environment mentioned");
  if(/\b(?:crash(?:ed|ing)?|slam(?:med|ming)?|rattl(?:e|ed|ing)|scrap(?:e|ed|ing)|press(?:ed|ing)?)\b.{0,65}\b(?:cage|mesh|steel|wall)\b|\b(?:cage|mesh|steel wall)\b.{0,65}\b(?:crash|slam|rattle|scrap|press)\b/i.test(text))
   cues.push("Steel enclosure affects the action");
 }
 if(rule?.stipulation==="IRON_MAN"){
  if(/\b(?:clock|thirty.minutes|30.minutes|time limit|falls)\b/i.test(text))
   cues.push("Timed multi-fall language appears");
  if(/\b(?:clock|time|seconds|minutes)\b.{0,65}\b(?:expire|wind|tick|remaining|ran out|run out|end)\b|\b(?:expire|wind|tick|remaining)\b.{0,65}\b(?:clock|time|seconds|minutes)\b/i.test(text))
   cues.push("Time-limit pressure is dramatized");
 }
 if(iq?.format==="BATTLE_ROYAL"&&/\b(?:rope|elimination|survivor|last (?:one|man|woman))\b/i.test(text))
  cues.push("Battle-royal mechanics mentioned");
 return {scenario:scenario.id,certifiedFactsValidated:true,
  diagnosticCues:cues,humanReviewRequired:true,reviewFocus:scenario.expectation,
  watchFor:scenario.watchFor};
}
