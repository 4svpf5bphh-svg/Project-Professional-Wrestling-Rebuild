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
test("critic and audience contradiction drives different safe reactions",()=>{
 const good=match("good",38),pop=match("popular",89);
 good.fallout!.ratingStars=4.5;pop.fallout!.ratingStars=1.75;
 const wire=showReactionWire(show([good,pop]));
 assert.equal(wire[0]!.source,"CRITIC_CROWD");
 assert.equal(wire[1]!.source,"CRITIC_CROWD");
 assert.match(wire[0]!.text,/stars|critical|quality/i);
 assert.match(wire[1]!.text,/critics|rating|crowd/i);
});
test("dirty finish reaction never assigns an unrecorded attacker",()=>{
 const bout=match("dq",70);
 bout.outcome="DISQUALIFICATION";
 const noActor=showReactionWire(show([bout]))[0]!;
 assert.equal(noActor.source,"FINISH");
 assert.doesNotMatch(noActor.text,/caught (Winner|Loser)|used by (Winner|Loser)/);
 bout.fallout!.finishCheaterName="Loser";
 assert.match(showReactionWire(show([bout]))[0]!.text,/Loser/);
});
test("refused, interrupted and successful angles stay distinguishable",()=>{
 const refused:ShowResultEntry={...base,type:"SEGMENT",slotId:"no",
  headline:"A dramatic turn",summary:"Turn refused",
  outcome:"REFUSED",intent:"TURN_OCCURRED",segmentKind:"TURN"};
 const interrupted={...refused,slotId:"partial",outcome:"INTERRUPTED"};
 const completed={...refused,slotId:"yes",outcome:"HAPPENS"};
 const story=showReactionWire(show([refused,interrupted,completed]));
 assert.equal(story[0]!.slotId,"yes");
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
