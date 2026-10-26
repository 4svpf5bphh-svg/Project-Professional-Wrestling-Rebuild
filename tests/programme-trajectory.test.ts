import test from "node:test";
import assert from "node:assert/strict";
import {readProgrammeTrajectory} from "../src/domain/programme-trajectory.js";
const base={heat:55,repetition:0,activityCount:2,matchCount:1,
 segmentCount:1,sideAWins:1,sideBWins:0};
test("programme summaries recognise real completed chapters and potential payoffs",()=>{
 assert.equal(readProgrammeTrajectory({...base,activityCount:0}).kind,"NEW");
 assert.equal(readProgrammeTrajectory(base).kind,"BUILDING");
 assert.equal(readProgrammeTrajectory({...base,activityCount:5}).kind,"ESCALATING");
 assert.equal(readProgrammeTrajectory({...base,heat:83,activityCount:5}).kind,"PAYOFF");
});
test("overexposure and lost momentum are visible without changing booking",()=>{
 const stale=readProgrammeTrajectory({...base,activityCount:8,repetition:40,heat:85});
 assert.equal(stale.kind,"STALE");
 assert.match(stale.summary,/repeating/);
 const cooling=readProgrammeTrajectory({...base,activityCount:4,heat:20});
 assert.equal(cooling.kind,"COOLING");
 assert.equal(readProgrammeTrajectory({...base,activityCount:5,
  matchCount:0,heat:95}).kind,"ESCALATING");
});
test("one-sided rivalry advice is editorial and doesn't mutate its input",()=>{
 const result=readProgrammeTrajectory({...base,activityCount:6,
  sideAWins:4,sideBWins:0});
 assert.equal(result.kind,"ESCALATING");
 assert.match(result.summary,/winning advantage/);
 assert.ok(!JSON.stringify(result).includes("winnerId"));
 assert.equal(base.activityCount,2);
});
