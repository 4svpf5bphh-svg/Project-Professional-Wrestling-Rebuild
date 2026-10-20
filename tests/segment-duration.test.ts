import test from "node:test";
import assert from "node:assert/strict";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
import {newEditorSegment,restoreEditorSegment,buildEditorSegment}
 from "../src/ui/card-segment-model.js";

test("scripted angles use booker-owned, persisted running times",()=>{
 const start=newEditorSegment("promo");
 assert.equal(start.durationMinutes,5);
 const authored={...start,durationMinutes:12,
  actors:[{personId:"w",contractId:"c"}]};
 const payload=buildEditorSegment(authored);
 assert.equal(payload.durationMinutes,12);
 const recovered=restoreEditorSegment("promo",payload);
 assert.equal(recovered.durationMinutes,12);
 assert.equal(recovered.actors[0]?.personId,"w");
});
test("historical angles without timing default to five minutes and remain editable",()=>{
 const restored=restoreEditorSegment("old",{kind:"PROMO",actorIds:["a"],
  outcome:"HAPPENS",participants:[{personId:"a",contractId:"a-contract"}]});
 assert.equal(restored.durationMinutes,5);
 assert.equal(buildEditorSegment(restored).durationMinutes,5);
});
test("angles reject unsafe airtime and a one-person promo may not target a rival",()=>{
 const base={slotId:"promo",position:0,kind:"PROMO" as const,
  actorIds:["a"],targetIds:[] as string[],outcome:"HAPPENS" as const};
 const cast=[{personId:"a",contractId:"a-contract"}];
 for(const durationMinutes of [0,31,1.5,Number.NaN])
  assert.throws(()=>buildBookedSegmentPayload({...base,durationMinutes},cast),
   /Invalid authored segment/);
 assert.throws(()=>buildBookedSegmentPayload({...base,targetIds:["b"]},
  [...cast,{personId:"b",contractId:"b-contract"}]),/Invalid segment booking roles/);
 assert.equal(buildBookedSegmentPayload({...base,durationMinutes:30},cast).durationMinutes,30);
});
