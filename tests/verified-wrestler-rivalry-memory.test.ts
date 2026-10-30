import test from "node:test";
import assert from "node:assert/strict";
import {describeWrestlerRivalryMemory,deriveStaffRivalryObservations}
 from "../src/domain/verified-wrestler-rivalry-memory.js";

test("a wrestler remembers completed bouts as wins, losses or undecided matches",()=>{
 const base={kind:"RIVALRY_MATCH" as const,relatedName:"Samoa Joe",ownSide:"A" as const,
  winnerSide:"A" as const,weekIndex:54};
 assert.match(describeWrestlerRivalryMemory(base),/They won a recorded rivalry match against Samoa Joe/);
 assert.match(describeWrestlerRivalryMemory({...base,winnerSide:"B"}),/They lost/);
 assert.match(describeWrestlerRivalryMemory({...base,winnerSide:null}),/without a confirmed winning side/);
 assert.match(describeWrestlerRivalryMemory({...base,kind:"RIVALRY_ANGLE"}),/played out on screen/);
 assert.doesNotMatch(describeWrestlerRivalryMemory({...base,kind:"RIVALRY_ANGLE"}),
  /They won|They lost/);
 assert.throws(()=>describeWrestlerRivalryMemory({...base,relatedName:""}),/Invalid/);
});
test("the staff talk about a real named match and an unfulfilled rematch without booking one",()=>{
 const s={sideA:"Samoa Joe",sideB:"Matt Riddle",heat:70,
  lastKind:"MATCH" as const,lastWeekIndex:8,lastWinnerSide:"B" as const,
  directionChoice:"PURSUE_REMATCH" as const,directionWeekIndex:8,
  laterMatch:false,laterAngle:true};
 const advice=deriveStaffRivalryObservations(s);
 assert.match(advice.creative??"",/Samoa Joe and Matt Riddle/);
 assert.match(advice.creative??"",/won by Matt Riddle/);
 assert.match(advice.creative??"",/return bout was requested but has not been completed/);
 assert.match(advice.priority??"",/Samoa Joe and Matt Riddle/);
 assert.match(advice.roadAgent??"",/next show/);
 assert.doesNotMatch(JSON.stringify(advice),/book automatically|scripted winner|force result/);
 assert.equal(deriveStaffRivalryObservations({...s,laterMatch:true}).priority,null);
 assert.equal(deriveStaffRivalryObservations({...s,heat:20}).priority,null);
});
test("a different subsequent bout cannot count as an authored retaliation scene",()=>{
 const s={sideA:"FTR",sideB:"Young Bucks",heat:81,lastKind:"SEGMENT" as const,
  lastWeekIndex:50,lastWinnerSide:null,directionChoice:"PLAN_RETALIATION" as const,
  directionWeekIndex:49,laterMatch:true,laterAngle:false};
 const notes=deriveStaffRivalryObservations(s);
 assert.match(notes.creative??"",/no later rivalry angle has been completed/);
 assert.doesNotMatch(notes.commentary??"",/won by/);
 const done=deriveStaffRivalryObservations({...s,laterAngle:true});
 assert.equal(done.priority,null);
 const blank=deriveStaffRivalryObservations(null);
 assert.deepEqual(blank,{creative:null,commentary:null,roadAgent:null,priority:null});
});
