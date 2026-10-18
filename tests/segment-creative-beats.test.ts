import test from "node:test";
import assert from "node:assert/strict";
import {initialCreativeBeat,isSegmentCreativeBeat,CREATIVE_BEAT_FIELDS}
 from "../src/domain/segment-creative-beats.js";
import {creativeFields,creativeSummary} from "../src/ui/segment-creative-options.js";

test("specialist fields enforce original-main choices and exclusive kind",()=>{
 for(const kind of Object.keys(CREATIVE_BEAT_FIELDS)){
  const beat=initialCreativeBeat(kind)!;
  assert.ok(beat);
  assert.equal(isSegmentCreativeBeat(beat,kind),true);
  assert.ok(creativeSummary(beat));
  assert.equal(creativeFields(kind).length,Object.keys(beat).length-1);
  assert.equal(isSegmentCreativeBeat({...beat,extra:"mystery"},kind),false);
  assert.equal(isSegmentCreativeBeat(beat,"TURN"),false);
  for(const key of Object.keys(beat).filter(k=>k!=="kind"))
   assert.equal(isSegmentCreativeBeat({...beat,[key]:"NOT_AN_OPTION"},kind),false);
 }
 assert.equal(initialCreativeBeat("VIDEO_PACKAGE"),null);
});

test("interruption, rescue and post-match endings cannot be forged or mixed",()=>{
 const kinds=[
  ["INTERRUPTION","VERBAL_EXCHANGE"],
  ["RESCUE","ATTACKER_ESCAPES"],
  ["POST_MATCH_ASSAULT","OFFICIALS_SEPARATE"]
 ] as const;
 for(const [kind,ending] of kinds){
  assert.equal(isSegmentCreativeBeat({kind,ending},kind),true);
  assert.equal(isSegmentCreativeBeat({kind,ending},"ATTACK"),false);
  assert.equal(isSegmentCreativeBeat({kind,ending:"SWERVE"},kind),false);
 }
});
