import test from "node:test";
import assert from "node:assert/strict";
import {newEditorSegment,addSegmentPerson,buildEditorSegment,restoreEditorSegment}
 from "../src/ui/card-segment-model.js";
import {buildBookedSegmentPayload} from "../src/domain/segment-booking.js";
const actor={personId:"a",contractId:"c"};
test("player chooses the direction of a turn, including genuine face turns",()=>{
 let s=newEditorSegment("turn","TURN");
 s=addSegmentPerson(s,"actors",actor);
 s.turnTargetAlignment="FACE";
 const value=buildEditorSegment(s);
 assert.equal(value.turnTargetAlignment,"FACE");
 assert.equal(restoreEditorSegment("turn",value).turnTargetAlignment,"FACE");
});
test("turn direction cannot be attached to unrelated angles",()=>{
 assert.throws(()=>buildBookedSegmentPayload({
  slotId:"s",position:0,kind:"PROMO",actorIds:["a"],targetIds:[],
  outcome:"HAPPENS",turnTargetAlignment:"HEEL"
 },[actor]),/Invalid authored segment/);
});
test("historical turn without a direction remains valid without a fabricated change",()=>{
 const s=buildBookedSegmentPayload({
  slotId:"turn",position:0,kind:"TURN",actorIds:["a"],targetIds:[],outcome:"HAPPENS"
 },[actor]);
 assert.equal(s.turnTargetAlignment,undefined);
 assert.equal(restoreEditorSegment("turn",s).turnTargetAlignment,null);
});
