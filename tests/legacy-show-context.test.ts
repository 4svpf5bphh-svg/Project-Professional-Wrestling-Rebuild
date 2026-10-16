import test from "node:test";
import assert from "node:assert/strict";
import {combineArchivedShowMatchContext,combineRecordedSegmentCrowd} from "../src/simulation/legacy/show-context.js";
import type {ArchivedPacingPreview} from "../src/simulation/legacy/show-pacing.js";
import type {ArchivedAlignmentEvaluation} from "../src/simulation/legacy/show-alignment.js";
const p:ArchivedPacingPreview={phase:"PACING_ONLY_NOT_FINAL",
 baseMatchCrowd:70,basePacingCrowd:70,crowdResponsePacingOnly:71,
 pacingAdjustment:1,segments:"NOT_PROJECTED",
 pendingContext:["ALIGNMENT","PROGRAMME","DIRTY_FINISH_HISTORY"],
 matches:[{matchId:"a",position:0,originalCrowd:70,adjustedPacingCrowd:71,
 pacingModifier:1,pacingReason:"BREATHER",weight:1}]};
const a:ArchivedAlignmentEvaluation={matchId:"a",position:0,modifier:2.2,
 reason:"FACE_HEEL_CLARITY",baseModifier:2.2,baseReason:"FACE_HEEL_CLARITY",
 volatilityModifier:0};
const g={matchId:"a",modifier:2.5,reason:"HOT_PROGRAMME" as const,linkedActiveProgrammeCount:1};
const f={matchId:"a",modifier:1.8,reason:"HEEL_CHEATING_HEAT" as const,
 repeatCount:0,programmeLinked:true};
test("all original match modifiers combine once, in legacy order",()=>{
 const x=combineArchivedShowMatchContext(p,[a],[g],[f]);
 assert.equal(x.matches[0]!.adjustedCrowdResponse,77.5);
 assert.equal(x.crowdResponse,77.5);
 assert.equal(x.adjustment,7.5);
 assert.equal(x.phase,"MATCH_CONTEXT_ONLY_NOT_FINAL");
});
test("missing or duplicated context is rejected rather than silently zeroed",()=>{
 assert.throws(()=>combineArchivedShowMatchContext(p,[],[g],[f]));
 assert.throws(()=>combineArchivedShowMatchContext(p,[a,a],[g],[f]));
 assert.throws(()=>combineArchivedShowMatchContext(p,[a],[{...g,matchId:"other"}],[f]));
 assert.throws(()=>combineArchivedShowMatchContext({...p,segments:"PROVIDED"},[a],[g],[f]));
});
test("crowd response is clamped after modifiers",()=>{
 assert.equal(combineArchivedShowMatchContext(p,[{...a,modifier:50}],[g],[f])
  .crowdResponse,100);
});

test("recorded segments use original 0.65 weight without changing match scores",()=>{
 const c=combineArchivedShowMatchContext(p,[a],[g],[f]);
 const x=combineRecordedSegmentCrowd(c,[{position:1,crowdResponse:50}]);
 assert.equal(x.crowdResponse,66.7);
 assert.equal(x.baseCrowdResponse,62.1);
 assert.equal(x.adjustment,4.6);
 assert.equal(x.matches[0]!.adjustedCrowdResponse,77.5);
 assert.equal(x.segmentReactions,"RECORDED_CROWD_ONLY");
});
test("recorded segments must have real bounded scores and distinct positions",()=>{
 const c=combineArchivedShowMatchContext(p,[a],[g],[f]);
 assert.throws(()=>combineRecordedSegmentCrowd(c,[{position:0,crowdResponse:50}]));
 assert.throws(()=>combineRecordedSegmentCrowd(c,[{position:1,crowdResponse:101}]));
 assert.throws(()=>combineRecordedSegmentCrowd(c,[{position:1,crowdResponse:50},{position:1,crowdResponse:60}]));
});
