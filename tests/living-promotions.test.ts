import test from "node:test";
import assert from "node:assert/strict";
import {originalPromotionScaleScore,originalSurvivalCounters}
 from "../src/domain/living-career.js";
test("original company scale responds to territories and finances",()=>{
 const local={liveStrength:80,awareness:80,loyalty:75};
 const healthy=originalPromotionScaleScore({localMarkets:[local],
  mediaReach:70,showPerformance:75,financialDistress:"HEALTHY"});
 const crisis=originalPromotionScaleScore({localMarkets:[local],
  mediaReach:70,showPerformance:75,financialDistress:"CRISIS"});
 assert.ok(healthy>crisis);
});
test("original 4-week survival pressure recovers after eight healthy weeks",()=>{
 const first=originalSurvivalCounters({distress:"CRISIS",healthyWeeks:0,
  stressWeeks:4,crisisWeeks:4,understaffedWeeks:4,rosterCount:2,
  minimumRoster:6,interval:4});
 assert.equal(first.stressWeeks,8);
 const second=originalSurvivalCounters({...first,distress:"HEALTHY",
  rosterCount:8,minimumRoster:6,interval:4});
 assert.equal(second.healthyWeeks,4);
 assert.equal(second.stressWeeks,0);
});
