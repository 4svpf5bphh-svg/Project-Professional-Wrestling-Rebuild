import test from "node:test";
import assert from "node:assert/strict";
import {SPECIAL_MOMENTS,specialMomentBySku,isSpecialMomentForScene}
 from "../src/domain/special-moments.js";
import {angleLocationsFor} from "../src/domain/angle-scene.js";
import {newEditorSegment,addSegmentPerson,buildEditorSegment,restoreEditorSegment}
 from "../src/ui/card-segment-model.js";
import {describeAuthoredSegment} from "../src/domain/segment-results.js";

const cast=(id:string)=>({personId:id,contractId:"deal-"+id});
test("eight actual unlockable spectacles each belong to a core angle and suitable stage",()=>{
 assert.equal(SPECIAL_MOMENTS.length,8);
 assert.equal(new Set(SPECIAL_MOMENTS.map(x=>x.sku)).size,SPECIAL_MOMENTS.length);
 for(const moment of SPECIAL_MOMENTS){
  assert.ok(moment.price>=1000&&moment.price<=2500);
  for(const location of moment.locations){
   assert.ok(angleLocationsFor(moment.kind).includes(location),moment.sku+" stage");
   assert.ok(isSpecialMomentForScene(moment.sku,moment.kind,location,
    moment.needsTarget?1:0));
   if(moment.needsTarget)
    assert.equal(isSpecialMomentForScene(moment.sku,moment.kind,location,0),false);
  }
  assert.equal(isSpecialMomentForScene(moment.sku,"VIDEO_PACKAGE","VIDEO_SCREEN",2),false);
 }
 assert.equal(specialMomentBySku("MOMENT_WRONG"),null);
});
test("hosedown is a real interruption choice, survives edit and is described in completed results",()=>{
 let s=newEditorSegment("hosedown","INTERRUPTION");
 s=addSegmentPerson(s,"actors",cast("joker"));
 s=addSegmentPerson(s,"targets",cast("rival"));
 s.specialMoment="MOMENT_VEHICLE_HOSING";
 s.scene={...s.scene!,location:"BACKSTAGE"};
 assert.throws(()=>buildEditorSegment(s),/Invalid authored segment/);
 s.scene={...s.scene!,location:"RINGSIDE"};
 const booked=buildEditorSegment(s);
 assert.equal(booked.specialMoment,s.specialMoment);
 assert.deepEqual(buildEditorSegment(restoreEditorSegment("hosedown",booked)),booked);
 const result=describeAuthoredSegment(booked,new Map([["joker","Joe"],["rival","Riddle"]]));
 assert.match(result.summary,/vehicle/i);
 assert.match(result.summary,/Riddle/);
 assert.equal(result.specialMoment,s.specialMoment);
});
test("spectacles reject forged types, mismatched locations and missing victims",()=>{
 let s=newEditorSegment("show","CELEBRATION");
 s=addSegmentPerson(s,"actors",cast("leader"));
 s.specialMoment="MOMENT_MOCK_CEREMONY";
 assert.throws(()=>buildEditorSegment(s),/Invalid authored segment/);
 s=addSegmentPerson(s,"targets",cast("rival"));
 assert.ok(buildEditorSegment(s));
 s.scene={...s.scene!,location:"PARKING_LOT"};
 assert.throws(()=>buildEditorSegment(s),/Invalid authored segment/);
 s.specialMoment="MOMENT_VEHICLE_HOSING";
 assert.throws(()=>buildEditorSegment(s),/Invalid authored segment/);
});
