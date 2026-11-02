import test from "node:test";
import assert from "node:assert/strict";
import {angleLocationsFor,initialAngleScene,anglePurposesFor,
 isAngleScene} from "../src/domain/angle-scene.js";
import {newEditorSegment,addSegmentPerson,buildEditorSegment}
 from "../src/ui/card-segment-model.js";
import {creativeFields} from "../src/ui/segment-creative-options.js";
import {initialCreativeBeat} from "../src/domain/segment-creative-beats.js";
import {describeAuthoredSegment} from "../src/domain/segment-results.js";
import {ANGLE_TYPES} from "../src/ui/card-segment-model.js";

test("all 17 angles have curated scene lists and video broadcasts cannot be booked as car park scenes",()=>{
 assert.equal(ANGLE_TYPES.length,17);
 for(const {value:kind} of ANGLE_TYPES){
  const options=angleLocationsFor(kind);
  assert.ok(options.length>0,kind+" has no locations");
  assert.ok(options.includes(initialAngleScene(kind).location));
  assert.equal(new Set(options).size,options.length);
 }
 assert.deepEqual(angleLocationsFor("VIDEO_PACKAGE"),["VIDEO_SCREEN"]);
 assert.equal(initialAngleScene("VIDEO_PACKAGE").location,"VIDEO_SCREEN");
 for(const kind of ["PROMO","INTERVIEW","CHALLENGE","INTERRUPTION"] as const)
  assert.ok(!angleLocationsFor(kind).includes("PARKING_LOT"));
 assert.ok(angleLocationsFor("PROMO").includes("ARENA_FOYER"));
 assert.ok(angleLocationsFor("PROMO").includes("IN_CROWD"));
 assert.deepEqual(anglePurposesFor("PROMO"),anglePurposesFor("INTERVIEW"));
 assert.ok(isAngleScene({...initialAngleScene("POST_MATCH_ASSAULT"),location:"RINGSIDE"},"POST_MATCH_ASSAULT"));
});
test("targets on promos and interviews survive signed booking without making them challenges",()=>{
 for(const kind of ["PROMO","INTERVIEW"] as const){
  let s=newEditorSegment(kind,kind);
  s=addSegmentPerson(s,"actors",{personId:"joe",contractId:"joe-deal"});
  s=addSegmentPerson(s,"targets",{personId:"mistico",contractId:"mistico-deal"});
  const booked=buildEditorSegment(s);
  assert.equal(booked.kind,kind);
  assert.deepEqual(booked.targetIds,["mistico"]);
  assert.match(describeAuthoredSegment(booked,new Map([["joe","Joe"],["mistico","Místico"]])).summary,/Místico/);
 }
});
test("an interruption can involve entire tag teams or trios on each side",()=>{
 let scene=newEditorSegment("faceoff","INTERRUPTION");
 for(const id of ["a","b","c"])scene=addSegmentPerson(scene,"actors",{personId:id,contractId:"c"+id});
 for(const id of ["d","e","f"])scene=addSegmentPerson(scene,"targets",{personId:id,contractId:"c"+id});
 assert.equal(buildEditorSegment(scene).actorIds.length,3);
 assert.equal(buildEditorSegment(scene).targetIds.length,3);
});
test("new exit beatdown and surprise-betrayal direction are properly authored",()=>{
 assert.ok(creativeFields("STABLE_EXIT").some(f=>f.options.some(x=>/beatdown/i.test(x.label))));
 assert.ok(creativeFields("TURN").some(f=>f.options.some(x=>/Betray a partner/i.test(x.label))));
 assert.ok(initialCreativeBeat("STABLE_EXIT"));
 assert.ok(creativeFields("INTERRUPTION").some(f=>f.options.some(x=>
  x.value==="BRAWL"&&/interruption/i.test(x.label))));
});

test("specific on-screen betrayals and faction beatdowns require a real victim",()=>{
 let turn=newEditorSegment("turn","TURN");
 turn=addSegmentPerson(turn,"actors",{personId:"joe",contractId:"joe-deal"});
 turn.creativeBeat={kind:"TURN",presentation:"BETRAY_PARTNER"};
 assert.throws(()=>buildEditorSegment(turn),/Invalid authored segment/);
 turn=addSegmentPerson(turn,"targets",{personId:"partner",contractId:"partner-deal"});
 assert.ok(buildEditorSegment(turn).targetIds.includes("partner"));
 let exit=newEditorSegment("exit","STABLE_EXIT");
 exit=addSegmentPerson(exit,"actors",{personId:"leader",contractId:"leader-deal"});
 exit.stableId="stable";
 exit.creativeBeat={kind:"STABLE_EXIT",departure:"BEATDOWN"};
 assert.throws(()=>buildEditorSegment(exit),/Invalid authored segment/);
 exit=addSegmentPerson(exit,"targets",{personId:"member",contractId:"member-deal"});
 assert.deepEqual(buildEditorSegment(exit).targetIds,["member"]);
});
