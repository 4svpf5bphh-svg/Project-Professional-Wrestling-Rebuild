import test from "node:test";
import assert from "node:assert/strict";
import {showReactionWire} from "../src/domain/show-reaction-wire.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
const base={position:0,crowdResponse:80,actorIds:[],targetIds:[]};
function match(slotId:string,crowd=80):ShowResultEntry{return {
 ...base,slotId,type:"MATCH",headline:"Winner wins",summary:"Pinfall",
 outcome:"CLEAN_PIN",crowdResponse:crowd,fallout:{injuries:[],eliminations:[]},
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:16,
  sides:[["Winner"],["Loser"]],winnerNames:["Winner"],championshipContested:false},
};}
function show(entries:ShowResultEntry[]):CompletedShowView{return {
 showId:"show",year:2,week:16,crowdResponse:73,entries,
 matchCount:entries.filter(e=>e.type==="MATCH").length,
 angleCount:entries.filter(e=>e.type==="SEGMENT").length,
};}
test("wire is deterministic, ranked by verified developments, limited and slot-linked",()=>{
 const title=match("title");
 title.fallout!.title={name:"World Title",winnerName:"Winner",
  priorHolderName:"Loser",changed:true};
 const injury=match("medical");
 injury.fallout!.injuries=[{personName:"Loser",severity:"MAJOR",
  weeksOut:5,stoppage:false}];
 const hot=match("hype",90);
 const cold=match("cold",29);
 const entries=show([cold,hot,injury,title]);
 const wire=showReactionWire(entries);
 assert.deepEqual(wire.map(x=>x.slotId),["title","medical","hype","cold"]);
 assert.deepEqual(showReactionWire(entries),wire);
 assert.ok(wire.every(x=>x.text.length>25&&!x.text.includes("@")));
 assert.deepEqual(showReactionWire(entries,2).map(x=>x.slotId),["title","medical"]);
 assert.deepEqual(showReactionWire(entries,0),[]);
 assert.throws(()=>showReactionWire(entries,9),/Invalid Ringside reaction limit/);
});
test("a full card can attract five distinct fictional voices, with no new events",()=>{
 const events=Array.from({length:5},(_,i)=>match("hot-"+i,94));
 const result=showReactionWire(show(events));
 assert.equal(result.length,5);
 assert.equal(new Set(result.map(x=>x.voice)).size,5);
 assert.deepEqual(result.map(x=>x.slotId),events.map(x=>x.slotId));
 assert.deepEqual(showReactionWire(show(events)),result);
});
test("five hot match posts use distinct speaker personalities, not identical relabelled sentences",()=>{
 const hot=Array.from({length:5},(_,i)=>match("hot-persona-"+i,95));
 const wire=showReactionWire(show(hot));
 assert.equal(new Set(wire.map(p=>p.voice)).size,5);
 assert.equal(new Set(wire.map(p=>p.text)).size,5);
 const voices=new Map(wire.map(p=>[p.voice,p.text]));
 assert.match(voices.get("THE TAPE TRADER")??"",/watching|tape|match again/);
 assert.match(voices.get("THE DIEHARD")??"",/love wrestling|every week|wrestling/);
 assert.ok(wire.every(p=>p.slotId.startsWith("hot-persona-")));
 assert.deepEqual(showReactionWire(show(hot)),wire);
});
test("critic and audience contradiction drives different safe reactions",()=>{
 const good=match("good",38),pop=match("popular",89);
 good.fallout!.ratingStars=4.5;pop.fallout!.ratingStars=1.75;
 const wire=showReactionWire(show([good,pop]));
 assert.equal(wire[0]!.source,"CRITIC_CROWD");
 assert.equal(wire[1]!.source,"CRITIC_CROWD");
 assert.match(wire[0]!.text,/technique|wrestling|quiet|critics/i);
 assert.equal(wire[0]!.reply?.voice,"THE DIEHARD");
 assert.match(wire[0]!.reply!.text,/audience/i);
 assert.match(wire[1]!.text,/critics|technical|building/i);
 assert.equal(wire[1]!.reply?.voice,"THE TAPE TRADER");
});
test("dirty finish reaction never assigns an unrecorded attacker",()=>{
 const bout=match("dq",70);
 bout.outcome="DISQUALIFICATION";
 const noActor=showReactionWire(show([bout]))[0]!;
 assert.equal(noActor.source,"FINISH");
 assert.doesNotMatch(noActor.text,/caught (Winner|Loser)|used by (Winner|Loser)/);
 bout.fallout!.finishCheaterName="Loser";
 assert.match(showReactionWire(show([bout]))[0]!.text,/Loser/);
 assert.equal(showReactionWire(show([bout]))[0]!.reply?.voice,"THE SKEPTICAL SMARK");
});
test("refused, interrupted and successful angles stay distinguishable",()=>{
 const refused:ShowResultEntry={...base,type:"SEGMENT",slotId:"no",
  headline:"A dramatic turn",summary:"Turn refused",
  outcome:"REFUSED",intent:"TURN_OCCURRED",segmentKind:"TURN"};
 const interrupted={...refused,slotId:"partial",outcome:"INTERRUPTED"};
 const completed={...refused,slotId:"yes",outcome:"HAPPENS"};
 const story=showReactionWire(show([refused,interrupted,completed]));
 assert.equal(story[0]!.slotId,"yes");
 assert.match(story[0]!.reply?.text??"",/mask is off/);
 assert.match(story.find(x=>x.slotId==="no")!.text,/refused/i);
 assert.match(story.find(x=>x.slotId==="partial")!.text,/interrupted/i);
 assert.doesNotMatch(story.find(x=>x.slotId==="no")!.text,/actually took place/i);
});
test("historic missing evidence never invents a title, injury, run-in or winner",()=>{
 const old=match("old",82);delete old.fallout;delete old.matchContext;
 const wire=showReactionWire(show([old]));
 assert.equal(wire.length,1);
 assert.doesNotMatch(wire[0]!.text,/champion|injur|stole|with help/i);
 assert.deepEqual(showReactionWire(show([])),[]);
});
test("storyline fatigue versus heat is taken only from certified programme signal",()=>{
 const tired=match("repetition",66);
 tired.fallout!.linkedProgrammes=1;tired.fallout!.programmeSignal="PROGRAMME_REPETITION";
 const hot=match("hot",68);
 hot.fallout!.linkedProgrammes=1;hot.fallout!.programmeSignal="HOT_PROGRAMME";
 const wire=showReactionWire(show([hot,tired]));
 assert.match(wire[0]!.text,/repetition/i);
 assert.match(wire[1]!.text,/heat/i);
});

test("battle royal elimination order and named victory are factual",()=>{
 const royal=match("royal",69);
 royal.outcome="OVER_THE_TOP_ROPE";
 royal.matchContext={...royal.matchContext!,format:"BATTLE ROYAL",
  sides:[["A"],["B"],["C"]],winnerNames:["C"]};
 royal.fallout!.eliminations=["A","B"];
 const result=showReactionWire(show([royal]))[0]!;
 assert.equal(result.source,"ELIMINATION");
 assert.match(result.text,/B went out/);
 assert.match(result.text,/C finished on top/);
 assert.doesNotMatch(result.text,/eliminated by C|clothesline|powerbomb/i);
});
test("submission and flash-pin reactions never guess specific manoeuvres",()=>{
 const tap=match("tap",74);tap.outcome="SUBMISSION";
 const flash=match("flash",75);flash.outcome="FLASH_PIN";
 const wire=showReactionWire(show([tap,flash]));
 assert.deepEqual(wire.map(x=>x.source),["FINISH","FINISH"]);
 const byId=new Map(wire.map(x=>[x.slotId,x.text]));
 assert.match(byId.get("tap")!,/submission/);
 assert.match(byId.get("flash")!,/flash pin/);
 assert.doesNotMatch(wire.map(x=>x.text).join(" "),/crossface|roll-up|cradle/);
});

test("fictional fans do not speak in simulation scores or pass for real posts",()=>{
 const title=match("belt");title.fallout!.title={name:"World Title",winnerName:"Winner",priorHolderName:"Loser",changed:true};
 const bad=match("cold",20);const posts=showReactionWire(show([title,bad]));
 assert.ok(posts.every(p=>!(/@|\b(?:\d+\/100|simulation|crowd score|execution score|protected finish|foreign object)\b/i).test(p.text)));
 assert.ok(posts.every(p=>p.slotId==="belt"||p.slotId==="cold"));
});
