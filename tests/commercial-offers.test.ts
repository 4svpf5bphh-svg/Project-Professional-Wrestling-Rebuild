import test from "node:test";
import assert from "node:assert/strict";
import {commercialOffers} from "../src/domain/commercial-offers.js";

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
  "BROADCAST_STABLE","BROADCAST_GROWTH","SPONSOR_LOCAL"
 ]);
 assert.equal(options[0]!.weeklyIncome,11200);
 assert.equal(options[0]!.reachIncrease,5);
 assert.equal(options[1]!.weeklyIncome,10400);
 assert.equal(options[1]!.reachIncrease,17);
 assert.equal(options[2]!.weeklyIncome,2160);
 assert.equal(options[2]!.reachIncrease,0);
 assert.deepEqual(options.map(x=>x.termWeeks),[26,26,13]);
});
test("major terms require sustained genuine results and national standing",()=>{
 const strong={...settled,tier:"NATIONAL",completedShows:10,averageCrowd:78};
 const offers=commercialOffers(strong);
 assert.deepEqual(offers.map(x=>x.code),[
  "BROADCAST_STABLE","BROADCAST_GROWTH","BROADCAST_TV",
  "SPONSOR_LOCAL","SPONSOR_PARTNER"
 ]);
 assert.equal(offers[2]!.weeklyIncome,12000);
 assert.equal(offers[4]!.weeklyIncome,2320);
 assert.equal(commercialOffers({...strong,tier:"RISING"}).some(x=>x.code==="BROADCAST_TV"),false);
 assert.equal(commercialOffers({...strong,averageCrowd:71}).some(x=>x.code==="BROADCAST_TV"),false);
 assert.equal(commercialOffers({...strong,completedShows:8}).some(x=>x.code==="BROADCAST_TV"),false);
});
