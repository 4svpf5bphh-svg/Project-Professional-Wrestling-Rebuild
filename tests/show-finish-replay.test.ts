import test from "node:test";
import assert from "node:assert/strict";
import {replayVerifiedMatchFinish} from "../src/domain/show-finish-replay.js";
import type {ShowResultEntry} from "../src/db/show-results-view.js";
const match=(outcome:string):ShowResultEntry=>({
 slotId:"main",position:0,type:"MATCH",headline:"A wins",summary:"Result",
 crowdResponse:75,outcome,actorIds:["a","b"],targetIds:[],
 matchContext:{format:"SINGLES",intent:"COMPETITIVE",plannedMinutes:15,
  sides:[["Alice"],["Bob"]],winnerNames:["Alice"],
  championshipContested:false},
});
test("every known finish has its own replay category and correct winner",()=>{
 for(const [outcome,tone] of [
  ["CLEAN_PIN","CLEAN"],["FLASH_PIN","CLEAN"],["SUBMISSION","CLEAN"],
  ["FOREIGN_OBJECT","DIRTY"],["PROTECTED_FINISH","DIRTY"],
  ["DISQUALIFICATION","DIRTY"],["INJURY_STOPPAGE","MEDICAL"],
  ["OVER_THE_TOP_ROPE","ELIMINATION"],
 ]){
  const replay=replayVerifiedMatchFinish(match(outcome));
  assert.equal(replay?.tone,tone);
  assert.equal(replay?.winnerLabel,"Alice");
  assert.ok(replay!.description.length>20);
 }
});
test("medical stoppage shows only verified injury and cannot invent a recovery period",()=>{
 const entry=match("INJURY_STOPPAGE");
 entry.fallout={injuries:[{personName:"Bob",severity:"SEVERE",weeksOut:null,
  stoppage:true}],eliminations:[]};
 const replay=replayVerifiedMatchFinish(entry)!;
 assert.match(replay.description,/Bob.*severe/);
 assert.doesNotMatch(replay.description,/week|days out|powerbomb/);
});
test("planned spots are never misreported as interference that actually succeeded",()=>{
 const entry=match("PROTECTED_FINISH");
 entry.fallout={injuries:[],eliminations:[],
  interference:{personName:"Manager",outcome:"ABORTED"}};
 assert.doesNotMatch(replayVerifiedMatchFinish(entry)!.description,/confirmed outside run-in/);
 entry.fallout.interference!.outcome="SUCCESS";
 assert.match(replayVerifiedMatchFinish(entry)!.description,/confirmed outside run-in/);
});
test("angles and unknown finishes cannot invent recorded match action",()=>{
 assert.equal(replayVerifiedMatchFinish({...match("CLEAN_PIN"),type:"SEGMENT"}),null);
 assert.match(replayVerifiedMatchFinish(match("UNSUPPORTED"))!.description,
  /official finish/);
});
