import test from "node:test";
import assert from "node:assert/strict";
import {broadcastTone,reviewCompletedEntry,broadcastShowPulse}
 from "../src/domain/show-broadcast-review.js";
import type {ShowResultEntry} from "../src/db/show-results-view.js";
const basic={slotId:"one",position:0,crowdResponse:89,actorIds:[],targetIds:[]};
test("broadcast reviews are deterministic, score-banded and format aware",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Winners victorious",
  summary:"A clean pinfall settled the contest.",outcome:"CLEAN_PIN",
  matchContext:{format:"3v3",intent:"TECHNICAL",plannedMinutes:16,
   sides:[["A","B","C"],["D","E","F"]],winnerNames:["A","B","C"],
   championshipContested:false}};
 const first=reviewCompletedEntry(entry,"show");
 assert.deepEqual(reviewCompletedEntry(entry,"show"),first);
 assert.match(first.recap,/A & B & C vs D & E & F/);
 assert.match(first.recap,/mat craft|technical contest/i);
 assert.match(first.recap,/clean pinfall/);
 assert.equal(first.tag,"3v3 tag match");
 assert.equal(first.tone,"RED_HOT");
 assert.equal(broadcastTone(65),"OVER");
 assert.equal(broadcastTone(44),"FLAT");
});
test("championship contest is not reported as a title change",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"A victorious",
  summary:"A clean pinfall settled it.",outcome:"CLEAN_PIN",
  matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:null,
   sides:[["A"],["B"]],winnerNames:["A"],championshipContested:true}};
 const result=reviewCompletedEntry(entry,"s");
 assert.match(result.recap,/championship was on the line/);
 assert.doesNotMatch(result.recap,/new champion|changed hands|retained/i);
});
test("refusal and interruption never become successful angles",()=>{
 for(const outcome of ["REFUSED","INTERRUPTED"]){
  const entry:ShowResultEntry={...basic,type:"SEGMENT",segmentKind:"ATTACK",
   headline:"Backstage attack",summary:"The planned attack never happened.",
   outcome};
  const result=reviewCompletedEntry(entry,"s");
  assert.match(result.headline,outcome==="REFUSED"?/Didn't go to plan/:/Cut short/);
  assert.doesNotMatch(result.recap,/landed|succeeded|crushed/);
 }
});
test("pulse counts only scored completed entries and keeps the hottest",()=>{
 const a:ShowResultEntry={...basic,type:"MATCH",headline:"A",summary:"A",outcome:"CLEAN_PIN"};
 const b:ShowResultEntry={...a,slotId:"two",crowdResponse:28};
 assert.deepEqual(broadcastShowPulse([a,b]),
  {topSlotId:"one",hotMoments:1,coldMoments:1});
});

test("non-AI review names a confirmed new champion and medical consequence",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Result",
  summary:"The referee counted three.",outcome:"CLEAN_PIN",
  fallout:{
   title:{name:"World Championship",winnerName:"Challenger",
    priorHolderName:"Champion",changed:true},
   injuries:[{personName:"Champion",severity:"MODERATE",weeksOut:4,stoppage:false}],
   eliminations:[],interference:undefined,
  }};
 const result=reviewCompletedEntry(entry,"world");
 assert.match(result.headline,/NEW CHAMPION.*Challenger/);
 assert.match(result.recap,/World Championship/);
 assert.match(result.recap,/4 PPW weeks/);
 assert.equal(result.bulletins.length,2);
 assert.ok(result.paragraphs.length>=3);
});
test("contested title stays with champion when the decision does not transfer it",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Result",
  summary:"A DQ ends the match.",outcome:"DISQUALIFICATION",
  fallout:{title:{name:"Tag Titles",winnerName:"Challengers",
   priorHolderName:"Champions",changed:false},
   injuries:[],eliminations:[]}};
 const result=reviewCompletedEntry(entry,"world");
 assert.match(result.recap,/Champions remained champion/);
 assert.doesNotMatch(result.recap,/NEW CHAMPION|captured/);
});
test("verified run-in and battle royal eliminations enrich the report without inventing moves",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Winner",
  summary:"The last elimination decided the bout.",outcome:"OVER_THE_TOP_ROPE",
  fallout:{injuries:[],interference:{personName:"Manager",outcome:"ABORTED"},
   eliminations:["First","Second","Third"]}};
 const result=reviewCompletedEntry(entry,"world");
 assert.match(result.recap,/never|did not materialise/);
 assert.match(result.recap,/First → Second → Third/);
 assert.doesNotMatch(result.recap,/powerbomb|suplex|signature finisher/i);
});

test("ongoing rivalries enrich the match report only when a certified programme is linked",()=>{
 const entry:ShowResultEntry={...basic,type:"MATCH",headline:"Booked feud",
  summary:"A clean pinfall.",outcome:"CLEAN_PIN",
  fallout:{injuries:[],eliminations:[],linkedProgrammes:1,
   programmeSignal:"HOT_PROGRAMME",ratingStars:4.5,executionQuality:89,
   actualMinutes:28}};
 const reviewed=reviewCompletedEntry(entry,"rivalry");
 assert.match(reviewed.recap,/certified chapter in 1 active rivalry/);
 assert.match(reviewed.recap,/meaningful heat/);
 assert.match(reviewed.recap,/exceptional in-ring execution/);
 assert.match(reviewed.recap,/28 minutes/);
 entry.fallout!.programmeSignal="PROGRAMME_REPETITION";
 assert.match(reviewCompletedEntry(entry,"rivalry").recap,
  /enough repetition/);
 entry.fallout!.linkedProgrammes=0;
 assert.doesNotMatch(reviewCompletedEntry(entry,"rivalry").recap,
  /chapter in|repetition/);
});
