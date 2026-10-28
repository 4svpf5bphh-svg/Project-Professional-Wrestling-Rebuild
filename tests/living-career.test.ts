import test from "node:test";
import assert from "node:assert/strict";
import {originalCareerWeek,originalAnnualTier,sustainableAnnualTier,originalPromotionScaleScore,originalMoraleEvidence,originalTrustYear}
 from "../src/domain/living-career.js";
const prospect={biologicalAge:24.999,careerExperience:40,developmentAptitude:80,
 careerStage:"PROSPECT" as const,status:"ACTIVE" as const,wear:2,
 popularity:20,recognition:15,
 skills:{inRingQuality:52,matchCraft:56,safety:61,stamina:70,presentation:40}};
test("original match development and age-led stage transition remain deterministic",()=>{
 const a=originalCareerWeek(prospect,2,4.5),b=originalCareerWeek(prospect,2,4.5);
 assert.deepEqual(a,b);
 assert.equal(a.next.careerStage,"PRIME");
 assert.ok(a.next.skills.inRingQuality>prospect.skills.inRingQuality);
 assert.ok(a.next.careerExperience>prospect.careerExperience);
 assert.equal(a.retirementProbability,0);
 assert.equal(prospect.careerStage,"PROSPECT");
});
test("original old/worn performer loses stamina while craft can improve",()=>{
 const a=originalCareerWeek({...prospect,biologicalAge:48,wear:92,
 careerStage:"VETERAN" as const,popularity:80,recognition:80},0,0);
 assert.ok(a.next.skills.stamina<prospect.skills.stamina);
 assert.equal(a.next.careerStage,"SPECIAL_ATTRACTION");
 assert.ok(a.retirementProbability>0);
});
test("morale respects usage, fatigue, expectations and crisis",()=>{
 const base={role:"MAIN_EVENT" as const,used:false,hadShow:true,
 injured:false,momentum:50,fatigue:0,distress:"HEALTHY" as const,
 inactive:false,currentMorale:70};
 assert.ok(originalMoraleEvidence(base)<70);
 assert.ok(originalMoraleEvidence({...base,used:true})>
  originalMoraleEvidence(base));
 assert.ok(originalMoraleEvidence({...base,fatigue:85,distress:"CRISIS"})<
  originalMoraleEvidence(base));
});
test("annual trust penalises terminations and tier thresholds only move one rung",()=>{
 assert.equal(originalTrustYear({current:50,appearances:13,terminations:0,dormant:false}),57.8);
 assert.ok(originalTrustYear({current:50,appearances:13,terminations:1,dormant:false})<50);
 assert.equal(originalAnnualTier("LOCAL",95),"INDEPENDENT");
 assert.equal(originalAnnualTier("GLOBAL",0),"NATIONAL");
});

test("financially unstable companies cannot expand their tier, but can recover or decline",()=>{
 for(const distress of ["WATCH","DISTRESSED","CRISIS"] as const){
  assert.equal(sustainableAnnualTier("LOCAL",95,distress,12),"LOCAL");
  assert.equal(sustainableAnnualTier("INDEPENDENT",95,distress,12),"INDEPENDENT");
  assert.equal(sustainableAnnualTier("RISING",95,distress,12),"RISING");
  assert.equal(sustainableAnnualTier("NATIONAL",0,distress,12),"RISING");
 }
 assert.equal(sustainableAnnualTier("LOCAL",95,"HEALTHY",12),"INDEPENDENT");
 assert.equal(sustainableAnnualTier("RISING",95,"HEALTHY",12),"NATIONAL");
 assert.equal(sustainableAnnualTier("LOCAL",0,"CRISIS",12),"LOCAL");
});

test("a strong legacy audience alone cannot promote a company without certified shows",()=>{
 const score=originalPromotionScaleScore({
  localMarkets:[{liveStrength:98,awareness:96,loyalty:97}],
  mediaReach:95,showPerformance:45,financialDistress:"HEALTHY",
 });
 assert.ok(score>30,"Previously this would promote a company that ran no shows");
 assert.equal(sustainableAnnualTier("LOCAL",score,"HEALTHY",0),"LOCAL");
 assert.equal(sustainableAnnualTier("LOCAL",score,"HEALTHY",1),"INDEPENDENT");
 assert.throws(()=>sustainableAnnualTier("LOCAL",score,"HEALTHY",-1),
  /Invalid annual certified show count/);
});
