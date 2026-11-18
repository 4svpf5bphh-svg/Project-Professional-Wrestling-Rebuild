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

test("an authored response to a certified chapter survives edits without inventing a booking",()=>{
 const original={blueprintId:"UNDERDOG",motivation:"Earn respect",
  audienceGoal:"Sympathy",destination:"The Lottery",
  followUp:{choice:"CHANGE_PRESENTATION",sourceShowId:"actual-show",
   sourceSlotId:"real-scene",sourceWeekIndex:12}};
 assert.deepEqual(parseProgrammeCreativeIntent(original),original);
 for(const wrong of [
  {...original,followUp:{...original.followUp,choice:"FORCE_BETRAYAL"}},
  {...original,followUp:{...original.followUp,sourceWeekIndex:-1}},
  {...original,followUp:{...original.followUp,sourceShowId:""}},
  {...original,followUp:{...original.followUp,sourceSlotId:"x".repeat(201)}}
 ])assert.throws(()=>parseProgrammeCreativeIntent(wrong));
});
