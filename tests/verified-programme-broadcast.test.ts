import test from "node:test";
import assert from "node:assert/strict";
import {parseVerifiedProgrammeBroadcast,programmeBroadcastRecap,programmeManagementNote}
 from "../src/domain/verified-programme-broadcast.js";
const match={programmeId:"joe-riddle",sideA:"Samoa Joe",sideB:"Matt Riddle",
 precedingMatches:2,precedingAngles:1,previousWinner:"B" as const,
 previousMatchWeek:52,currentWinner:"A" as const};
test("Ringside recalls actual earlier meetings while keeping the current result separate",()=>{
 const original=JSON.stringify(match);
 const verified=parseVerifiedProgrammeBroadcast(match);
 const copy=programmeBroadcastRecap(verified,"MATCH");
 assert.match(copy,/Samoa Joe vs Matt Riddle/);
 assert.match(copy,/already met 2 times in the previous twelve weeks/);
 assert.match(copy,/latest was Year 2, Week 1, won by Matt Riddle/);
 assert.match(copy,/This chapter went to Samoa Joe/);
 assert.match(copy,/1 on-screen chapter/);
 assert.equal(JSON.stringify(match),original);
});
test("a confirmed rivalry angle is not a match win or evidence of a brawl",()=>{
 const copy=programmeBroadcastRecap({...match,currentWinner:null},"SEGMENT");
 assert.match(copy,/new on-screen chapter/);
 assert.match(copy,/not automatically a match result/);
 assert.doesNotMatch(copy,/This chapter went to/);
});
test("newly started stories and undecided bouts never invent a winner",()=>{
 const p=parseVerifiedProgrammeBroadcast({...match,precedingMatches:0,
  precedingAngles:0,previousWinner:null,previousMatchWeek:null,currentWinner:null});
 assert.match(programmeBroadcastRecap(p,"MATCH"),/no previous recorded match/);
 assert.match(programmeBroadcastRecap(p,"MATCH"),/no confirmed winning side/);
});
test("staff storyline advice is optional, derived from completed story history and not a booking",()=>{
 assert.equal(programmeManagementNote([]),null);
 const first=programmeManagementNote([match]);
 assert.match(first??"",/Samoa Joe and Matt Riddle have history/);
 const two=programmeManagementNote([match,match]);
 assert.equal(two,first,"One programme must not inflate the number of rivalries");
 assert.match(programmeManagementNote([match,{...match,programmeId:"another"}])??"",
  /2 ongoing rivalries/);
 const newOne=programmeManagementNote([{...match,precedingMatches:0,precedingAngles:0}]);
 assert.match(newOne??"",/first recorded chapter/);
});
test("malformed or speculative programme context is rejected at the results boundary",()=>{
 for(const corrupted of [
  null,[],{...match,programmeId:""},{...match,sideA:""},
  {...match,precedingMatches:-1},{...match,previousMatchWeek:-5},
  {...match,currentWinner:"C"},{...match,previousWinner:"FUTURE"},
  {...match,precedingAngles:NaN}
 ])assert.throws(()=>parseVerifiedProgrammeBroadcast(corrupted),/Invalid settled programme context/);
});
