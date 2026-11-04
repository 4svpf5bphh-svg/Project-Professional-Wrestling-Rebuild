import test from "node:test";
import assert from "node:assert/strict";
import {commercialOffers,COMMERCIAL_COMPANIES,broadcasterRatingTarget,partnerResponse}
 from "../src/domain/commercial-offers.js";

const settled={
 tier:"LOCAL",mediaReach:100,weeklyMediaIncome:10000,
 weeklySponsorIncome:2000,completedShows:3,averageCrowd:62
};
test("commercial deals require evidence and never materialise from missing Genesis terms",()=>{
 assert.deepEqual(commercialOffers({...settled,completedShows:2}),[]);
 assert.deepEqual(commercialOffers({...settled,averageCrowd:47}),[]);
 assert.deepEqual(commercialOffers({...settled,weeklyMediaIncome:null,
  weeklySponsorIncome:null}),[]);
 assert.deepEqual(commercialOffers({...settled,weeklyMediaIncome:0,
  weeklySponsorIncome:0}),[]);
});
test("one earned broadcaster tradeoff and sensible sponsorship, with capped initial choices",()=>{
 const options=commercialOffers(settled);
 assert.deepEqual(options.map(x=>x.code),[
  "BROADCAST_STABLE","BROADCAST_GROWTH","SPONSOR_LOCAL","SPONSOR_GEAR"
 ]);
 assert.equal(options[0]!.weeklyIncome,11200);
 assert.equal(options[0]!.reachIncrease,0);
 assert.equal(options[1]!.weeklyIncome,10400);
 assert.equal(options[1]!.reachIncrease,0);
 assert.equal(options[2]!.weeklyIncome,2160);
 assert.equal(options[2]!.reachIncrease,0);
 assert.deepEqual(options.map(x=>x.termWeeks),[26,26,13,26]);
});
test("major terms require sustained genuine results and national standing",()=>{
 const strong={...settled,tier:"NATIONAL",completedShows:10,averageCrowd:78};
 const offers=commercialOffers(strong);
 assert.deepEqual(offers.filter(x=>["BROADCAST_STABLE","BROADCAST_GROWTH",
  "BROADCAST_TV","SPONSOR_LOCAL","SPONSOR_PARTNER"].includes(x.code))
  .map(x=>x.code),["BROADCAST_STABLE","BROADCAST_GROWTH","BROADCAST_TV",
    "SPONSOR_LOCAL","SPONSOR_PARTNER"]);
 assert.ok(offers.length>=9,"Established promotions receive a wide fictional commercial market");
 assert.equal(offers.find(x=>x.code==="BROADCAST_TV")?.weeklyIncome,12000);
 assert.equal(offers.find(x=>x.code==="SPONSOR_PARTNER")?.weeklyIncome,2320);
 assert.equal(commercialOffers({...strong,tier:"RISING"}).some(x=>x.code==="BROADCAST_TV"),false);
 assert.equal(commercialOffers({...strong,averageCrowd:71}).some(x=>x.code==="BROADCAST_TV"),false);
 assert.equal(commercialOffers({...strong,completedShows:8}).some(x=>x.code==="BROADCAST_TV"),false);
});

test("fictional sponsor and broadcaster identities keep their economics separate",()=>{
 const offers=commercialOffers({...settled,completedShows:12,averageCrowd:84,
  tier:"GLOBAL"});
 assert.equal(new Set(offers.map(x=>x.name)).size,offers.length);
 assert.ok(offers.length>=11);
 assert.equal(offers.find(x=>x.code==="SPONSOR_LOCAL")?.name,"Jack's Crematorium");
 assert.equal(offers.find(x=>x.code==="BROADCAST_GROWTH")?.name,"VibeFlix");
 assert.equal(offers.find(x=>x.code==="BROADCAST_TV")?.name,"BBS Sports");
 assert.ok(offers.filter(x=>x.kind==="SPONSOR").every(x=>x.reachIncrease===0));
 assert.ok(offers.every(x=>x.termWeeks===13||x.termWeeks===26||x.termWeeks===52));
});

test("long-term broadcasters saturate at 100 rather than blocking demand in later years",()=>{
 const low=commercialOffers({...settled,mediaReach:90});
 assert.equal(low.find(o=>o.code==="BROADCAST_STABLE")?.reachIncrease,5);
 assert.equal(low.find(o=>o.code==="BROADCAST_GROWTH")?.reachIncrease,10);
 const high=commercialOffers({...settled,mediaReach:98});
 assert.equal(high.find(o=>o.code==="BROADCAST_GROWTH")?.reachIncrease,2);
 assert.ok(commercialOffers({...settled,mediaReach:100})
  .filter(o=>o.kind==="BROADCAST").every(o=>o.reachIncrease===0));
 const overLegacy=commercialOffers({...settled,mediaReach:105});
 assert.ok(overLegacy.filter(o=>o.kind==="BROADCAST")
  .every(o=>o.reachIncrease===0));
});

test("verified TV ratings strengthen partner terms, poor ratings close premium doors",()=>{
 const baseline=commercialOffers({...settled,tier:"NATIONAL",
  completedShows:10,averageCrowd:78});
 const great=commercialOffers({...settled,tier:"NATIONAL",
  completedShows:10,averageCrowd:78,recentTvEpisodes:4,averageTvRating:2.2});
 const bad=commercialOffers({...settled,tier:"NATIONAL",
  completedShows:10,averageCrowd:78,recentTvEpisodes:4,averageTvRating:.5});
 assert.ok(great.find(x=>x.code==="BROADCAST_TV")!.weeklyIncome>
  baseline.find(x=>x.code==="BROADCAST_TV")!.weeklyIncome);
 assert.ok(!bad.some(x=>x.code==="BROADCAST_TV"));
 assert.equal(commercialOffers({...settled,recentTvEpisodes:1,averageTvRating:99})
  .find(x=>x.code==="BROADCAST_STABLE")!.weeklyIncome,
  commercialOffers(settled).find(x=>x.code==="BROADCAST_STABLE")!.weeklyIncome);
});
test("fictional partner catalogue has twelve distinct branded personalities and scarcity messages",()=>{
 assert.equal(Object.keys(COMMERCIAL_COMPANIES).length,12);
 for(const [code,brand] of Object.entries(COMMERCIAL_COMPANIES)){
  assert.ok(brand.name&&brand.voice&&brand.mark&&brand.tagline);
  assert.ok(brand.preferredDay>=0&&brand.preferredDay<=7);
  assert.ok(brand.airtime.match(/^\d\d:\d\d$/));
  assert.ok(brand.ratingPressure>0);
  const held=partnerResponse(code,{tier:"LOCAL",heldBy:"CWA",current:false});
  assert.ok(held.includes("CWA"));
  if(code.startsWith("BROADCAST_")){
   const target=broadcasterRatingTarget(code,"NATIONAL");
   assert.ok(target>0);
   assert.match(partnerResponse(code,{tier:"NATIONAL",
    averageTvRating:target*1.4,current:false}),/stronger deal/);
  }
 }
});
