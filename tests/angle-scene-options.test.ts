import test from "node:test";
import assert from "node:assert/strict";
import {ANGLE_LOCATION_AREAS,angleLocationArea,angleSceneLocationPhrase,
 initialAngleScene,isAngleScene} from "../src/domain/angle-scene.js";
import {isSegmentCreativeBeat} from "../src/domain/segment-creative-beats.js";
import {normalizeBookedSegment} from "../src/domain/segment-booking.js";
test("precise arena, backstage and outdoor locations have distinct scenes",()=>{
 for(const [area,locations] of Object.entries(ANGLE_LOCATION_AREAS)){
  for(const place of locations){
   assert.equal(angleLocationArea(place),area);
   assert.ok(angleSceneLocationPhrase(place).length>5);
   assert.ok(isAngleScene({location:place,visual:"NONE",
    purpose:"BUILD_RIVALRY",intensity:"BEATDOWN"},"ATTACK"));
  }
 }
});
test("method, severity, visible aftermath and purpose survive real booking",()=>{
 const scene={location:"LOADING_BAY" as const,visual:"BLOODIED" as const,
  purpose:"SEEK_REVENGE" as const,intensity:"BRUTAL" as const};
 const booked=normalizeBookedSegment({
  slotId:"ambush",position:0,kind:"ATTACK",outcome:"HAPPENS",
  actorIds:["joe"],targetIds:["mistico"],scene,
  creativeBeat:{kind:"ATTACK",presentation:"PREMEDITATED_AMBUSH",
   objective:"ESCALATE_RIVALRY"}
 },new Set(["joe","mistico"]));
 assert.deepEqual(booked.scene,scene);
 assert.deepEqual(booked.actorIds,["joe"]);
 assert.deepEqual(booked.targetIds,["mistico"]);
 assert.ok(isSegmentCreativeBeat(booked.creativeBeat,"ATTACK"));
});
test("warning must not claim a bloodied outcome; old scene remains valid",()=>{
 assert.equal(isAngleScene({location:"LOCKER_ROOM",
  visual:"BLOODIED",intensity:"WARNING",purpose:"BUILD_RIVALRY"},"ATTACK"),false);
 assert.equal(isAngleScene({location:"LOCKER_ROOM",
  visual:"BLOODIED",purpose:"BUILD_RIVALRY"},"ATTACK"),true);
 assert.equal(isAngleScene({location:"STREET_ENTRANCE",
  visual:"BLOODIED",purpose:"MAKE_STATEMENT",intensity:"BRUTAL"},"PROMO"),false);
 assert.equal(isAngleScene({location:"OUTSIDE_ARENA",visual:"NONE",
  purpose:"MAKE_STATEMENT",extra:"weeks out"},"ATTACK"),false);
 assert.equal(initialAngleScene("PROMO").intensity,undefined);
});
test("post-match action remains attached to the arena",()=>{
 assert.ok(isAngleScene({...initialAngleScene("POST_MATCH_ASSAULT"),
  location:"RINGSIDE"},"POST_MATCH_ASSAULT"));
 assert.equal(isAngleScene({...initialAngleScene("POST_MATCH_ASSAULT"),
  location:"STREET_ENTRANCE"},"POST_MATCH_ASSAULT"),false);
});
