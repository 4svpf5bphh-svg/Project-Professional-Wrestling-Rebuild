import test from "node:test";
import assert from "node:assert/strict";
import {newEditorSegment,addSegmentPerson,buildEditorSegment,restoreEditorSegment}
 from "../src/ui/card-segment-model.js";
test("author-owned confrontation survives editor roundtrip",()=>{
 let s=newEditorSegment("fight","CONFRONTATION");
 s=addSegmentPerson(s,"actors",{personId:"a",contractId:"ca"});
 s=addSegmentPerson(s,"targets",{personId:"b",contractId:"cb"});
 s.outcome="REFUSED";
 const payload=buildEditorSegment(s);
 assert.equal(payload.outcome,"REFUSED");
 assert.deepEqual(payload.actorIds,["a"]);
 assert.deepEqual(payload.targetIds,["b"]);
 assert.deepEqual(buildEditorSegment(restoreEditorSegment("fight",payload)),payload);
});
test("an angle needs declared role and no double-cast",()=>{
 let s=newEditorSegment("s","ATTACK");
 assert.throws(()=>buildEditorSegment(s),/roles/);
 s=addSegmentPerson(s,"actors",{personId:"a",contractId:"ca"});
 assert.throws(()=>addSegmentPerson(s,"targets",{personId:"a",contractId:"ca"}),/two roles/);
 assert.throws(()=>buildEditorSegment(s),/roles/);
});
test("original promo, interview and challenge book as real segments",()=>{
 for(const kind of ["PROMO","INTERVIEW","CELEBRATION","CHALLENGE"] as const){
  let s=newEditorSegment(kind,kind);
  s=addSegmentPerson(s,"actors",{personId:"a",contractId:"ca"});
  if(kind==="CHALLENGE")s=addSegmentPerson(s,"targets",{personId:"b",contractId:"cb"});
  assert.equal(buildEditorSegment(s).kind,kind);
 }
});
