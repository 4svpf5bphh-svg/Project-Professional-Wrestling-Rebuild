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

test("selected finish object and referee bump survive the certified result and medical override",()=>{
 const entry=match("FOREIGN_OBJECT");
 entry.matchContext={...entry.matchContext!,finishProp:"SCREWDRIVER",refereeSpot:"REF_BUMP"};
 entry.fallout={injuries:[],eliminations:[],finishCheaterName:"Alice"};
 const replay=replayVerifiedMatchFinish(entry)!;
 assert.match(replay.description,/screwdriver/i);
 assert.match(replay.description,/knocked down/);
 assert.match(replay.description,/Alice/);
 const later=match("INJURY_STOPPAGE");
 later.matchContext={...later.matchContext!,finishProp:"SCREWDRIVER",refereeSpot:"REF_BUMP"};
 assert.doesNotMatch(replayVerifiedMatchFinish(later)!.description,/screwdriver|knocked down/i);
});

test("fallback finish labels use the saved object, never a randomly invented prop",async()=>{
 const {shortResultColour}=await import("../src/domain/show-result-colour.js");
 const entry=match("FOREIGN_OBJECT");
 entry.matchContext={...entry.matchContext!,finishProp:"SCREWDRIVER",refereeSpot:"REF_BUMP"};
 const text=shortResultColour(entry,"fixed-show");
 assert.match(text,/screwdriver/i);
 assert.doesNotMatch(text,/chair|kendo|ring bell/i);
 const legacy=shortResultColour(match("FOREIGN_OBJECT"),"legacy-show");
 assert.match(legacy,/concealed weapon/);
 assert.doesNotMatch(legacy,/chair|bell|chain|kendo|screwdriver/i);
 const clean=match("CLEAN_PIN");
 clean.performerIdentities=[{personId:"a",ringName:"Alice",character:"Cocky challenger",style:null,
  signatureMoves:["Imaginary Finish"],finishingMoves:["Never Booked"],source:"WORLD_RECORD"}];
 assert.doesNotMatch(shortResultColour(clean,"one"),/Imaginary Finish|Never Booked/);
});

test("offline main-event copy carries certified title defence and actual ringside help",async()=>{
 const {shortResultColour}=await import("../src/domain/show-result-colour.js");
 const entry=match("FOREIGN_OBJECT");
 entry.fallout={injuries:[],eliminations:[],
  title:{name:"CWA Intercontinental Championship",winnerName:"Alice",
   priorHolderName:"Alice",changed:false},
  interference:{personName:"Manager",outcome:"SUCCESS"}};
 const story=shortResultColour(entry,"title-main");
 assert.match(story,/Alice retained the CWA Intercontinental Championship/);
 assert.match(story,/Manager made a decisive intervention/);
 assert.doesNotMatch(story,/kendo|ring bell|steel chair|screwdriver/i);
 entry.fallout.interference!.outcome="ABORTED";
 assert.doesNotMatch(shortResultColour(entry,"title-main"),/decisive intervention/i);
});

test("offline title fallout distinguishes winning the match from retaining the championship",async()=>{
 const {shortResultColour}=await import("../src/domain/show-result-colour.js");
 const noTransfer=match("DISQUALIFICATION");
 noTransfer.fallout={injuries:[],eliminations:[],
  title:{name:"CWA Heavyweight Title",winnerName:"Alice",
   priorHolderName:"Bob",changed:false}};
 const result=shortResultColour(noTransfer,"dq-challenge");
 assert.match(result,/Alice took the win by disqualification/);
 assert.match(result,/Bob kept the CWA Heavyweight Title/);
 assert.doesNotMatch(result,/Alice retained|Alice is the new/);
 const vacant=match("FOREIGN_OBJECT");
 vacant.fallout={injuries:[],eliminations:[],
  title:{name:"CWA Women's Title",winnerName:"Alice",
   priorHolderName:null,changed:false}};
 assert.match(shortResultColour(vacant,"vacant-dq"),/CWA Women's Title remains vacant/);
 assert.doesNotMatch(shortResultColour(vacant,"vacant-dq"),/retained/);
 const transfer=match("CLEAN_PIN");
 transfer.fallout={injuries:[],eliminations:[],
  title:{name:"CWA Women's Title",winnerName:"Alice",
   priorHolderName:"Bob",changed:true}};
 assert.match(shortResultColour(transfer,"title-win"),/Alice is the new CWA Women's Title champion/);
});
