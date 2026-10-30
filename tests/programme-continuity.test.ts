import test from "node:test";
import assert from "node:assert/strict";
import {readProgrammeContinuity} from "../src/domain/programme-continuity.js";

const match={showId:"show-a",slotId:"main",kind:"MATCH",weekIndex:9,
 crowdResponse:79,winnerSide:"A" as const};
const names={sideAName:"Samoa Joe",sideBName:"Matt Riddle"};
const choice={showId:"show-a",slotId:"main",weekIndex:9,
 choice:"PURSUE_REMATCH" as const};
test("a completed rivalry match, not a scripted plan, names the last winning side",()=>{
 const facts=[match,{showId:"show-b",slotId:"promo",kind:"SEGMENT",
  weekIndex:10,crowdResponse:73}];
 const snapshot=JSON.stringify(facts);
 const chapter=readProgrammeContinuity({...names,recentActivity:facts});
 assert.match(chapter.lastBell??"",/Samoa Joe won.*Year 1 · Week 10/);
 assert.match(chapter.latestChapter??"",/on-screen angle.*Week 11/);
 assert.equal(chapter.directionKind,"UNSET");
 assert.equal(JSON.stringify(facts),snapshot,"Reading does not rewrite verified World history");
 const unknown=readProgrammeContinuity({...names,recentActivity:[
  {...match,winnerSide:null}]});
 assert.doesNotMatch(unknown.lastBell??"",/Samoa Joe won|Matt Riddle won/);
});
test("a later certified match, not the triggering match, fulfils a rematch direction",()=>{
 const pending=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...choice,nextMatchWeekIndex:9,nextAngleWeekIndex:null}});
 assert.equal(pending.directionKind,"PENDING_REMATCH");
 assert.match(pending.directionSummary??"",/No later certified/);
 const build=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...choice,nextMatchWeekIndex:null,nextAngleWeekIndex:10}});
 assert.equal(build.directionKind,"BUILDING_REMATCH");
 const done=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...choice,nextMatchWeekIndex:11,nextAngleWeekIndex:10}});
 assert.equal(done.directionKind,"REMATCH_HELD");
 assert.match(done.directionSummary??"",/Year 1 · Week 12/);
 assert.match(done.suggestion??"",/That chapter is in the books/);
});
test("an actual subsequent angle fulfils retaliation; another match alone does not",()=>{
 const retaliation={...choice,choice:"PLAN_RETALIATION" as const};
 const waiting=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...retaliation,nextMatchWeekIndex:10,nextAngleWeekIndex:null}});
 assert.equal(waiting.directionKind,"PENDING_RETALIATION");
 assert.match(waiting.directionSummary??"",/match has taken place instead/);
 const shown=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...retaliation,nextMatchWeekIndex:null,nextAngleWeekIndex:12}});
 assert.equal(shown.directionKind,"ANGLE_AFTER_RETALIATION");
 assert.match(shown.directionSummary??"",/does not confirm that the scene delivered retaliation/);
});
test("letting a finish stand remains a valid player direction until a new actual beat",()=>{
 const stand={...choice,choice:"LET_STAND" as const};
 const quiet=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...stand,nextMatchWeekIndex:null,nextAngleWeekIndex:null}});
 assert.equal(quiet.directionKind,"RESULT_STANDS");
 const resumed=readProgrammeContinuity({...names,recentActivity:[match],
  latestFollowUp:{...stand,nextMatchWeekIndex:13,nextAngleWeekIndex:11}});
 assert.equal(resumed.directionKind,"STORY_RESUMED");
 assert.match(resumed.directionSummary??"",/Year 1 · Week 12/);
 assert.doesNotMatch(resumed.directionSummary??"",/retaliation happened/);
});
