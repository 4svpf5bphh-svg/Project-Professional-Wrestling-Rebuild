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

test("legacy promo with contracted speaker restores editable roles",()=>{
 const legacy={kind:"PROMO",outcome:"HAPPENS",
  participants:[{personId:"speaker",contractId:"signed"}]};
 const restored=restoreEditorSegment("old",legacy);
 assert.equal(restored.actors[0]!.personId,"speaker");
 assert.equal(buildEditorSegment(restored).actorIds[0],"speaker");
});
test("programme selection belongs to angle editor and never alters scripted outcome",()=>{
 const input={...newEditorSegment("promo"),programmeId:"rivalry"};
 const participant=addSegmentPerson(input,"actors",{personId:"speaker",contractId:"signed"});
 assert.equal(participant.programmeId,"rivalry");
 assert.equal(buildEditorSegment(participant).outcome,"HAPPENS");
});

test("new stable invitation keeps authored target and owned stable identity",()=>{
 let s=newEditorSegment("invite","STABLE_INVITATION");
 s=addSegmentPerson(s,"actors",{personId:"leader",contractId:"leader-deal"});
 s=addSegmentPerson(s,"targets",{personId:"prospect",contractId:"prospect-deal"});
 assert.throws(()=>buildEditorSegment(s),/Choose a stable/);
 s.stableId="stable-one";
 s.stableDecision="ACCEPTED";
 const p=buildEditorSegment(s);
 assert.equal(p.stableId,"stable-one");
 assert.equal(p.outcome,"HAPPENS");
 assert.deepEqual(p.targetIds,["prospect"]);
 assert.equal(restoreEditorSegment("invite",p).stableId,"stable-one");
});

test("faction invitation requires a player-scripted answer before booking",()=>{
 let s=newEditorSegment("story","STABLE_INVITATION");
 s.stableId="stable-one";
 s=addSegmentPerson(s,"actors",{personId:"leader",contractId:"leader-deal"});
 s=addSegmentPerson(s,"targets",{personId:"prospect",contractId:"prospect-deal"});
 assert.throws(()=>buildEditorSegment(s),/accepts or rejects/);
 s.stableDecision="REJECTED";
 const booked=buildEditorSegment(s);
 assert.equal(booked.stableDecision,"REJECTED");
 assert.equal(restoreEditorSegment("story",booked).stableDecision,"REJECTED");
});
