import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAuthoredSegmentCrowd} from "../src/simulation/legacy/segment-crowd.js";
import type {SegmentCrowdContext} from "../src/simulation/legacy/segment-crowd.js";
const c:SegmentCrowdContext={segment:{slotId:"attack",position:1,
 kind:"ATTACK",actorIds:["a"],targetIds:["b"],outcome:"HAPPENS"},
 performers:[{personId:"a",popularity:70,presentation:80,momentum:60},
 {personId:"b",popularity:60,presentation:70,momentum:50}],
 storylineHeat:80,repetitionCount:0};
test("scripted refusal is not automatically penalized or overwritten",()=>{
 const happened=evaluateAuthoredSegmentCrowd([c])[0]!;
 const refused=evaluateAuthoredSegmentCrowd([{...c,segment:{...c.segment,
  outcome:"REFUSED"}}])[0]!;
 assert.equal(happened.crowdResponse,refused.crowdResponse);
 assert.equal(refused.outcome,"REFUSED");
});
test("storyline heat helps and repetition eventually hurts",()=>{
 const hot=evaluateAuthoredSegmentCrowd([c])[0]!;
 const stale=evaluateAuthoredSegmentCrowd([{...c,repetitionCount:8}])[0]!;
 assert.equal(hot.crowdResponse-stale.crowdResponse,14);
 assert.ok(hot.crowdResponse>evaluateAuthoredSegmentCrowd([
  {...c,storylineHeat:10}])[0]!.crowdResponse);
});
test("hype video needs authored subtype and scores independently",()=>{
 const video={...c,segment:{...c.segment,kind:"VIDEO_PACKAGE" as const,
  videoPurpose:"RETURN_HYPE" as const,targetIds:[]}};
 const x=evaluateAuthoredSegmentCrowd([video])[0]!;
 assert.equal(x.components.kind,2);
 assert.equal(x.outcome,"HAPPENS");
});
test("invalid roster stats, missing talent and duplicate slots fail closed",()=>{
 assert.throws(()=>evaluateAuthoredSegmentCrowd([{...c,performers:[]}]));
 assert.throws(()=>evaluateAuthoredSegmentCrowd([{...c,storylineHeat:101}]));
 assert.throws(()=>evaluateAuthoredSegmentCrowd([c,c]));
});
