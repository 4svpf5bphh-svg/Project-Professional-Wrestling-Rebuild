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
