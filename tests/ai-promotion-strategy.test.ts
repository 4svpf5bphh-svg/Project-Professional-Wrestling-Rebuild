import test from "node:test";
import assert from "node:assert/strict";
import {aiPromotionIdentity,aiPromotionStrategy} from "../src/domain/ai-promotion-strategy.js";
const p={worldSeed:"12",promotionId:"alpha",year:2,week:1,
 riskTolerance:35,matchQualityPreference:90,starPreference:62};
test("stored AI preferences define distinct creative identities without affecting player promos",()=>{
 assert.equal(aiPromotionIdentity(p),"WORKRATE");
 assert.equal(aiPromotionIdentity({...p,riskTolerance:96}),"SPECTACLE");
 assert.equal(aiPromotionIdentity({...p,starPreference:99}),"STAR_POWER");
 assert.equal(aiPromotionIdentity({...p,riskTolerance:30,
  starPreference:30,matchQualityPreference:30}),"STORYTELLING");
 assert.throws(()=>aiPromotionIdentity({...p,starPreference:NaN}),/Invalid/);
});
test("direction lasts 13 weeks, rotates at quarter boundaries and replays exactly",()=>{
 const a=aiPromotionStrategy(p);
 assert.deepEqual(a,aiPromotionStrategy({...p,week:13}));
 assert.notEqual(a.focus,aiPromotionStrategy({...p,week:14}).focus);
 assert.equal(a.identity,"WORKRATE");
 assert.deepEqual(a,aiPromotionStrategy({...p}));
 assert.throws(()=>aiPromotionStrategy({...p,week:53}),/Invalid/);
});
