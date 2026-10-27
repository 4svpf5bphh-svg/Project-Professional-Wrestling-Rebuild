import assert from "node:assert/strict";
import test from "node:test";
import {originalMarketAfterEvent,balancedMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
const base={awareness:60,liveStrength:55,loyalty:70};
test("original home and away market performance, major premiums and attendance quality",()=>{
 const regular={eventType:"REGULAR" as const,isHomeMarket:true,
  expectedDemand:1000,attendance:1000,capacity:1100,
  averageMatchRating:3.5,crowdResponse:75};
 const good=originalMarketAfterEvent(base,regular);
 // strength delta 1.1 + (3.5-2.75)*.18 + (75-60)/180 = 1.31833
 assert.deepEqual(good,{awareness:60.2,liveStrength:56.3,loyalty:70.3});
 const away=originalMarketAfterEvent(base,{...regular,isHomeMarket:false});
 assert.equal(away.awareness,60.8);
 const major=originalMarketAfterEvent(base,{...regular,eventType:"MAJOR"});
 assert.equal(major.awareness,60.5);
 assert.ok(major.liveStrength>good.liveStrength);
 const flop=originalMarketAfterEvent(base,{...regular,attendance:250,capacity:2000,
  averageMatchRating:1.5,crowdResponse:25});
 assert.ok(flop.liveStrength<base.liveStrength);
 assert.equal(flop.loyalty,69.8);
 assert.deepEqual(originalMarketAfterEvent({awareness:99.99,liveStrength:99.99,loyalty:99.99},regular),
  {awareness:100,liveStrength:100,loyalty:100});
});
test("original markets reject guessed missing ratings or impossible capacity",()=>{
 assert.throws(()=>originalMarketAfterEvent(base,{eventType:"REGULAR",isHomeMarket:true,
  expectedDemand:100,attendance:200,capacity:100,averageMatchRating:3,crowdResponse:70}),/Invalid/);
 assert.throws(()=>originalMarketAfterEvent(base,{eventType:"REGULAR",isHomeMarket:true,
  expectedDemand:100,attendance:20,capacity:100,averageMatchRating:NaN,crowdResponse:70}),/Invalid/);
});

test("earned attendance cannot rescue repeatedly disappointing wrestling; established markets need quality",()=>{
 const sellout={eventType:"REGULAR" as const,isHomeMarket:true,
  expectedDemand:1800,attendance:1800,capacity:2000,
  averageMatchRating:2.2,crowdResponse:43};
 const established={awareness:88,liveStrength:94,loyalty:81};
 assert.ok(originalMarketAfterEvent(established,sellout).liveStrength>94);
 const weaker=balancedMarketAfterEvent(established,sellout);
 assert.ok(weaker.liveStrength<94,
  "Weak matches and unhappy fans must cost repeat-audience strength despite a full gate");
 assert.equal(weaker.awareness,originalMarketAfterEvent(established,sellout).awareness);
 assert.equal(weaker.loyalty,originalMarketAfterEvent(established,sellout).loyalty);
 const strong={...sellout,averageMatchRating:3.8,crowdResponse:82};
 assert.deepEqual(balancedMarketAfterEvent(base,strong),originalMarketAfterEvent(base,strong),
  "A high-quality show still earns all of the original attendance reward in a growing market");
 const elite=balancedMarketAfterEvent(established,strong);
 assert.ok(elite.liveStrength>established.liveStrength,
  "Outstanding shows must still grow prestigious territories");
 assert.ok(elite.liveStrength<originalMarketAfterEvent(established,strong).liveStrength,
  "Mature territories cannot snowball at the original unchecked rate");
 assert.deepEqual(balancedMarketAfterEvent(established,strong),
  balancedMarketAfterEvent(established,strong),"Resolution must be replay deterministic");
 assert.ok(balancedMarketAfterEvent({awareness:100,liveStrength:100,loyalty:100},sellout)
  .liveStrength<100,"A disappointed, saturated market must be able to decline");
 assert.throws(()=>balancedMarketAfterEvent(base,{...sellout,attendance:3000}),/Invalid/);
});
