import test from "node:test";
import assert from "node:assert/strict";
import {projectShowAudience} from "../src/domain/show-audience.js";
const base={tier:"GLOBAL" as const,eventType:"REGULAR" as const,
 mediaReach:83,awareness:75,liveStrength:66,loyalty:72,
 wrestlingInterest:60,expectedDemand:45000,averageMatchRating:3.8};
test("TV household ratings are separate from viewers and deterministic",()=>{
 const t=projectShowAudience(base);
 assert.equal(t.format,"TV");assert.equal(t.ppvBuys,null);
 assert.ok(t.householdRating!>=1&&t.householdRating!<=5.5);
 assert.ok(t.estimatedViewers!>100000);
 assert.notEqual(t.householdRating,t.estimatedViewers);
 assert.deepEqual(t,projectShowAudience(base));
});
test("reach and tier dominate commercial audience even with perfect matches",()=>{
 const small=projectShowAudience({...base,tier:"LOCAL",mediaReach:10,averageMatchRating:5});
 const big=projectShowAudience({...base,tier:"GLOBAL",mediaReach:95,averageMatchRating:2});
 assert.ok(big.estimatedViewers!>small.estimatedViewers!);
 assert.ok(small.householdRating!<=.2);
});
test("premium event purchases aren't TV ratings or money ledger entries",()=>{
 const premium=projectShowAudience({...base,eventType:"MAJOR"});
 const indie=projectShowAudience({...base,eventType:"MAJOR",
  tier:"INDEPENDENT",mediaReach:30});
 assert.equal(premium.format,"PPV");
 assert.equal(premium.householdRating,null);assert.equal(premium.estimatedViewers,null);
 assert.ok(premium.ppvBuys!>indie.ppvBuys!);
 assert.ok(premium.ppvBuys!<=1600000);
 assert.ok(indie.ppvBuys!<20000);
 assert.equal("incrementalCash" in premium,false);
});
test("bad audience evidence fails instead of fabricating a rating",()=>{
 assert.throws(()=>projectShowAudience({...base,mediaReach:NaN}));
 assert.throws(()=>projectShowAudience({...base,expectedDemand:-100}));
});
