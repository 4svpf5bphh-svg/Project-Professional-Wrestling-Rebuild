import test from "node:test";
import assert from "node:assert/strict";
import {earnedPromotionIdentity} from "../src/domain/earned-promotion-identity.js";
const evidence={workrate:8,spectacle:1,stars:1,stories:0,
 knownMatches:10,completedShows:4};
test("a human promotion earns its style from several verified shows, not a user selector",()=>{
 const style=earnedPromotionIdentity(evidence);
 assert.equal(style?.title,"In-ring wrestling");
 assert.equal(style?.category,"WORKRATE");
 assert.equal(style?.sampleMatches,10);
 assert.equal(earnedPromotionIdentity({...evidence,completedShows:2}),null);
 assert.equal(earnedPromotionIdentity({...evidence,knownMatches:5,
  workrate:3}),null);
});
test("stylistic ambiguity remains varied rather than awarding a false wrestling identity",()=>{
 const mixed=earnedPromotionIdentity({workrate:3,spectacle:3,stars:2,
  stories:2,knownMatches:10,completedShows:5});
 assert.equal(mixed?.category,"VARIED");
 assert.equal(earnedPromotionIdentity({...evidence,workrate:0,
  spectacle:8})?.category,"SPECTACLE");
 assert.equal(earnedPromotionIdentity({...evidence,workrate:0,
  stars:8})?.category,"STAR_POWER");
 assert.equal(earnedPromotionIdentity({...evidence,workrate:0,
  stories:8})?.category,"STORYTELLING");
});
test("incomplete or fabricated match counts cannot be presented as settled history",()=>{
 assert.throws(()=>earnedPromotionIdentity({...evidence,knownMatches:20}),/Invalid/);
 assert.throws(()=>earnedPromotionIdentity({...evidence,workrate:-1}),/Invalid/);
});
