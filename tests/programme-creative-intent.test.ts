import test from "node:test";
import assert from "node:assert/strict";
import {defaultProgrammeCreativeIntent,parseProgrammeCreativeIntent}
 from "../src/domain/programme-creative-intent.js";
import {STORY_BLUEPRINTS} from "../src/domain/story-blueprints.js";
test("all 16 approved blueprints yield typed editable Programme creative intent",()=>{
 for(const bp of STORY_BLUEPRINTS)assert.deepEqual(
  parseProgrammeCreativeIntent({blueprintId:bp.id,motivation:bp.motivation,
   audienceGoal:bp.desiredFeeling,destination:"A future event"}),
  {blueprintId:bp.id,motivation:bp.motivation,audienceGoal:bp.desiredFeeling,
   destination:"A future event"});
 assert.equal(parseProgrammeCreativeIntent(null),null);
 assert.equal(defaultProgrammeCreativeIntent().blueprintId,"CUSTOM");
});
test("rejects fabricated story IDs, malformed payloads and oversized text",()=>{
 for(const value of [{blueprintId:"FAKE",motivation:"",audienceGoal:"",destination:""},
  {blueprintId:"CUSTOM",motivation:"x".repeat(181),audienceGoal:"",destination:""},
  {blueprintId:"CUSTOM",motivation:"",audienceGoal:2,destination:""},
  [],"some text",{}])assert.throws(()=>parseProgrammeCreativeIntent(value));
});
