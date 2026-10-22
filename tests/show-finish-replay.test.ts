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
 assert.doesNotMatch(replayVerifiedMatchFinish(entry)!.description,/r[s]?ingside run-in/);
 entry.fallout.interference!.outcome="SUCCESS";
 assert.match(replayVerifiedMatchFinish(entry)!.description,/r[s]?ingside run-in/);
});
test("recorded dirty finish offender is named without inventing any moves",()=>{
 const entry=match("DISQUALIFICATION");
 entry.fallout={injuries:[],eliminations:[],finishCheaterName:"Bob"};
 assert.match(replayVerifiedMatchFinish(entry)!.description,/Bob.*disqualified/);
 const foreign=match("FOREIGN_OBJECT");
 foreign.fallout={injuries:[],eliminations:[],finishCheaterName:"Alice"};
 assert.match(replayVerifiedMatchFinish(foreign)!.description,/Alice.*weapon/);
});
test("angles and unknown finishes cannot invent recorded match action",()=>{
 assert.equal(replayVerifiedMatchFinish({...match("CLEAN_PIN"),type:"SEGMENT"}),null);
 assert.match(replayVerifiedMatchFinish(match("UNSUPPORTED"))!.description,
  /official finish/);
});

test("a dirty finish never claims that the referee caught an unnoticed weapon",()=>{
 const entry=match("FOREIGN_OBJECT");
 entry.fallout={injuries:[],eliminations:[],finishCheaterName:"Alice"};
 const replay=replayVerifiedMatchFinish(entry)!;
 assert.match(replay.description,/concealed weapon/);
 assert.doesNotMatch(replay.description,/caught bringing|foreign object|simulation/i);
});
