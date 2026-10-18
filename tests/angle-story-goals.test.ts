import test from "node:test";
import assert from "node:assert/strict";
import {ANGLE_TYPES} from "../src/ui/card-segment-model.js";
import {ANGLE_STORY_GOALS,SEGMENT_TYPES_ARE_COVERED,
 anglesForGoal,angleGoalFor,firstAngleFor,angleDirection} from "../src/ui/angle-story-goals.js";
test("every existing playable angle belongs to one creative direction",()=>{
 assert.equal(SEGMENT_TYPES_ARE_COVERED,true);
 const all=ANGLE_STORY_GOALS.flatMap(x=>x.types);
 assert.deepEqual([...all].sort(),ANGLE_TYPES.map(x=>x.value).sort());
 assert.equal(new Set(all).size,all.length);
 for(const kind of all){
  assert.ok(anglesForGoal(angleGoalFor(kind)).includes(kind));
  assert.ok(angleDirection(kind).length>24);
 }
 assert.equal(firstAngleFor("ARRIVAL"),"DEBUT");
 assert.deepEqual(anglesForGoal("VIDEO"),["VIDEO_PACKAGE"]);
 assert.throws(()=>firstAngleFor("NOT_A_GOAL" as never),/Unknown/);
});
