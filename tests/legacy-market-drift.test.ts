import assert from "node:assert/strict";
import test from "node:test";
import {originalMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
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
