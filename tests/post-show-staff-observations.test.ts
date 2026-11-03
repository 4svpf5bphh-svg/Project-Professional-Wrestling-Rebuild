import test from "node:test";
import assert from "node:assert/strict";
import {postShowStaffObservations} from "../src/domain/post-show-staff-observations.js";
import type {CompletedShowView,ShowResultEntry} from "../src/db/show-results-view.js";
const match=(id:string,position:number,stars=3.2):ShowResultEntry=>({
 slotId:id,position,type:"MATCH",headline:"Match "+id,summary:"Official result",
 crowdResponse:73,outcome:"CLEAN_PIN",actorIds:[],targetIds:[],
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:17,
 sides:[["A"],["B"]],winnerNames:["A"],championshipContested:false},
 fallout:{ratingStars:stars,executionQuality:76,actualMinutes:17,
  chemistryModifier:0,injuries:[],eliminations:[]}
});
const view=(entries:ShowResultEntry[]):CompletedShowView=>({
 showId:"show",year:1,week:4,crowdResponse:77,
 matchCount:entries.length,angleCount:0,entries
});
test("real injury, overtime and execution concerns produce specific linked observations",()=>{
 const a=match("opening",0,3.1),b=match("main",1,4.6);
 a.fallout!.injuries=[{personName:"Joe",severity:"MODERATE",weeksOut:3,stoppage:false}];
 b.fallout!.actualMinutes=27;
 a.fallout!.executionQuality=42;
 const notes=postShowStaffObservations(view([a,b]));
 assert.deepEqual(notes.map(x=>x.key),["injury","overrun","execution"]);
 assert.deepEqual(notes.map(x=>x.slotId),["opening","main","opening"]);
 assert.match(notes[1]!.note,/10 minutes/);
 assert.doesNotMatch(notes.map(x=>x.note).join(" " ),/cleared|will win/);
});
test("a strong clean show offers a concrete follow-up, never generic extra concerns",()=>{
 const a=match("main",0,4.7);
 const notes=postShowStaffObservations(view([a]));
 assert.deepEqual(notes.map(x=>x.key),["standout"]);
 assert.equal(notes[0]?.slotId,"main");
});
test("historical or absent evidence does not invent performance conclusions",()=>{
 const a=match("old",0);
 a.fallout={injuries:[],eliminations:[]};
 assert.deepEqual(postShowStaffObservations(view([a])),[]);
});
test("repetition is distinct from chemistry and only certified results trigger it",()=>{
 const a=match("main",0);
 a.fallout!.programmeSignal="PROGRAMME_REPETITION";
 const notes=postShowStaffObservations(view([a]));
 assert.equal(notes[0]?.key,"rivalry");
 assert.match(notes[0]!.note,/repetition/);
});
