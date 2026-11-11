import test from "node:test";
import assert from "node:assert/strict";
import {awardAiCommercialPartners,type AiCommercialCandidate}
 from "../src/domain/commercial-ai-market.js";
const candidate=(promotion_id:string,averageTvRating:number,
 averageCrowd:number,overrides:Partial<AiCommercialCandidate>={}):
 AiCommercialCandidate=>({
 promotion_id,active_kinds:[],tier:"LOCAL",mediaReach:65,
 weeklyMediaIncome:10000,weeklySponsorIncome:2000,
 completedShows:5,averageCrowd,recentTvEpisodes:3,averageTvRating,
 ...overrides
});
test("AI exclusive bidders compete on certified audience, not name order",()=>{
 const small=candidate("a-weak",.15,66);
 const strong=candidate("z-strong",.43,84);
 const awarded=awardAiCommercialPartners([small,strong],new Set());
 assert.deepEqual(awarded.map(a=>[a.offer.code,a.promotion.promotion_id]),[
  ["BROADCAST_GROWTH","z-strong"],["SPONSOR_GEAR","z-strong"]
 ]);
 assert.deepEqual(awardAiCommercialPartners([strong,small],new Set())
  .map(a=>a.promotion.promotion_id),["z-strong","z-strong"]);
});
test("World scarcity and signed kinds are respected without mutating inventory",()=>{
 const occupied=new Set(["BROADCAST_GROWTH","SPONSOR_GEAR"]);
 const strong=candidate("z-strong",.4,80);
 assert.deepEqual(awardAiCommercialPartners([strong],occupied).map(a=>a.offer.code),
  ["BROADCAST_STABLE","SPONSOR_LOCAL"]);
 assert.deepEqual([...occupied],["BROADCAST_GROWTH","SPONSOR_GEAR"]);
 assert.deepEqual(awardAiCommercialPartners([
  candidate("locked",.9,99,{active_kinds:["BROADCAST","SPONSOR"]})
 ],new Set()),[]);
 assert.deepEqual(awardAiCommercialPartners([strong],new Set([
  "BROADCAST_GLOBAL","BROADCAST_TV","BROADCAST_GROWTH","BROADCAST_ARCHIVE",
  "BROADCAST_INDIE","BROADCAST_STABLE","SPONSOR_LUXURY","SPONSOR_TECH",
  "SPONSOR_PARTNER","SPONSOR_GEAR","SPONSOR_FOOD","SPONSOR_LOCAL"
 ])),[]);
});
test("one unverified TV outlier does not steal the next partner slot",()=>{
 const unverified=candidate("a-outlier",99,77,{recentTvEpisodes:1});
 const verified=candidate("b-certified",.52,77);
 const awarded=awardAiCommercialPartners([unverified,verified],new Set());
 assert.equal(awarded.find(a=>a.offer.kind==="BROADCAST")?.promotion.promotion_id,
  "b-certified");
});
test("fair alphabetical tie-breaking and sponsor personality remain deterministic",()=>{
 const east=candidate("east",.2,77,{recentTvEpisodes:0,averageTvRating:null});
 const west=candidate("west",.2,77,{recentTvEpisodes:0,averageTvRating:null});
 const a=awardAiCommercialPartners([west,east],new Set());
 assert.deepEqual(a.map(x=>x.promotion.promotion_id),["east","east"]);
 const digital=awardAiCommercialPartners([
  candidate("older",.2,72,{tier:"RISING",completedShows:11}),
  candidate("rising",1.3,76,{tier:"RISING",completedShows:11})
 ],new Set(["SPONSOR_LUXURY"]));
 assert.equal(digital.find(x=>x.offer.kind==="SPONSOR")?.offer.code,"SPONSOR_TECH");
 assert.equal(digital.find(x=>x.offer.kind==="SPONSOR")?.promotion.promotion_id,"rising");
});

test("an AI sponsor can favour certified PPV buyers without inventing a TV win",()=>{
 const ordinary=candidate("a-weekly",.6,78,{tier:"NATIONAL",
  completedShows:11,recentPremiumShows:0,averagePpvBuys:null});
 const premium=candidate("z-ppv",.6,78,{tier:"NATIONAL",
  completedShows:11,recentPremiumShows:1,averagePpvBuys:210000});
 const occupied=new Set(["SPONSOR_LUXURY","SPONSOR_TECH","SPONSOR_PARTNER",
  "SPONSOR_GEAR","SPONSOR_FOOD"]);
 const deals=awardAiCommercialPartners([ordinary,premium],occupied);
 assert.equal(deals.find(x=>x.offer.kind==="SPONSOR")?.promotion.promotion_id,
  "z-ppv");
 assert.equal(deals.find(x=>x.offer.kind==="BROADCAST")?.promotion.promotion_id,
  "a-weekly");
});
