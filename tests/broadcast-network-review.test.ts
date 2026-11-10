import test from "node:test";
import {projectShowAudience} from "../src/domain/show-audience.js";
import {broadcasterRatingTarget,formatTvRating} from "../src/domain/commercial-offers.js";
import assert from "node:assert/strict";
import {assessBroadcastNetwork,broadcasterReaction,
 type BroadcastNetworkTerms,type CertifiedNetworkWeek}
 from "../src/domain/broadcast-network-review.js";
const deal:BroadcastNetworkTerms={dealId:"tv-a",offerCode:"BROADCAST_TV",
 tier:"NATIONAL",startWeekIndex:10,endWeekIndex:40,airingDay:5,airingHour:20};
const ep=(weekIndex:number,rating:number|null,showDay=5,
 audienceFormat:"TV"|"PPV"|null="TV"):CertifiedNetworkWeek=>
 ({weekIndex,showId:"show-"+weekIndex,showDay,audienceFormat,rating});
test("certified on-slot broadcasts protect guaranteed income while reviewing only performance pay",()=>{
 const x=assessBroadcastNetwork(deal,[ep(13,1.9),ep(14,1.7)],14)!;
 assert.equal(x.target,1.69);assert.equal(x.status,"ON_TARGET");
 assert.equal(x.bonusEligible,true);assert.equal(x.missedConsecutively,0);
 assert.match(broadcasterReaction(x),/Prime time/);
 assert.equal(assessBroadcastNetwork(deal,[],9),null);
});
test("three consecutive below-target episodes trigger a replay-stable warning",()=>{
 const a=[ep(11,1.9),ep(12,.7),ep(13,.8),ep(14,.9)];
 const x=assessBroadcastNetwork(deal,a,14)!;
 assert.equal(x.status,"BELOW_TARGET");assert.equal(x.milestone,"WARNING");
 assert.equal(x.missedConsecutively,3);assert.equal(x.previousMisses,2);
 assert.equal(x.bonusEligible,false);
 assert.deepEqual(assessBroadcastNetwork(deal,a,14),x);
 assert.equal(assessBroadcastNetwork(deal,a.slice(0,2),13)!.milestone,null);
});
test("moving a show outside the signed airtime loses only the performance bonus",()=>{
 const a=[ep(14,2.1),ep(15,3.1,6)];
 const x=assessBroadcastNetwork(deal,a,15)!;
 assert.equal(x.status,"OFF_SLOT");assert.equal(x.bonusEligible,false);
 assert.match(broadcasterReaction(x),/prime-time slot/);
 assert.equal(assessBroadcastNetwork({...deal,airingDay:null},a,15)!.status,"ON_TARGET");
});
test("recovered high-rating shows earn a positive network statement",()=>{
 const a=[ep(13,2.1),ep(14,.6),ep(15,.8),ep(16,.9),ep(17,2.1)];
 const x=assessBroadcastNetwork(deal,a,17)!;
 assert.equal(x.milestone,"RECOVERED");assert.equal(x.previousMisses,3);
 assert.equal(x.bonusEligible,true);assert.match(broadcasterReaction(x),/prime-time result/);
});
test("legacy unreported episodes never invent low ratings or cancel old incentives",()=>{
 const x=assessBroadcastNetwork(deal,[ep(10,null,5,null)],10)!;
 assert.equal(x.status,"LEGACY");assert.equal(x.bonusEligible,true);
 assert.equal(x.rating,null);assert.equal(x.missedConsecutively,0);
});
test("missed weeks and premium-only weeks are distinct from certified television",()=>{
 const premium=assessBroadcastNetwork(deal,[ep(14,2.4,5,"PPV")],14)!;
 assert.equal(premium.status,"NO_TV");assert.equal(premium.bonusEligible,false);
 assert.equal(assessBroadcastNetwork(deal,[],12)!.milestone,"WARNING");
 assert.equal(assessBroadcastNetwork(deal,[],14)!.milestone,"FINAL_WARNING");
});
test("review never crosses signed term or mutates its input",()=>{
 const a=[ep(10,1.8)];const original=JSON.stringify(a);
 assert.equal(assessBroadcastNetwork(deal,a,10)!.missedConsecutively,0);
 assert.equal(JSON.stringify(a),original);
 assert.throws(()=>assessBroadcastNetwork(deal,[ep(14,1.2),ep(14,1.4)],14),/duplicate/);
 assert.throws(()=>assessBroadcastNetwork({...deal,airingDay:8},[],10),/Invalid/);
});

test("regional network targets match achievable certified TV ratings without relaxing major networks",()=>{
 const audience=(tier:"LOCAL"|"INDEPENDENT"|"RISING"|"NATIONAL",mediaReach:number)=>
  projectShowAudience({tier,eventType:"REGULAR",mediaReach,awareness:55,
   liveStrength:55,loyalty:55,wrestlingInterest:60,expectedDemand:4500,
   averageMatchRating:3.25}).householdRating!;
 const at=(tier:BroadcastNetworkTerms["tier"],offerCode:string,rating:number)=>
  assessBroadcastNetwork({...deal,tier,offerCode,airingDay:5},
   [ep(15,rating)],15)!;
 const local=at("LOCAL","BROADCAST_STABLE",audience("LOCAL",20));
 const indie=at("INDEPENDENT","BROADCAST_INDIE",audience("INDEPENDENT",35));
 const rising=at("RISING","BROADCAST_GROWTH",audience("RISING",35));
 assert.equal(local.rating,.1);
 assert.equal(indie.rating,.1);
 assert.equal(rising.rating,.3);
 assert.equal(local.status,"ON_TARGET");
 assert.equal(indie.status,"WATCH");
 assert.equal(rising.status,"WATCH");
 assert.equal(local.bonusEligible,true);
 assert.equal(indie.bonusEligible,true);
 assert.equal(rising.bonusEligible,true);
 assert.equal(indie.missedConsecutively,0);
 assert.equal(rising.missedConsecutively,0);
 assert.equal(at("INDEPENDENT","BROADCAST_INDIE",0).status,"BELOW_TARGET",
  "Poor or missing TV audiences still fail; the network has not been silenced");
 assert.equal(at("NATIONAL","BROADCAST_TV",audience("NATIONAL",35)).status,"BELOW_TARGET");
 assert.equal(broadcasterRatingTarget("BROADCAST_TV","NATIONAL"),1.69);
 assert.equal(broadcasterRatingTarget("BROADCAST_GLOBAL","GLOBAL"),4.5);
 assert.equal(formatTvRating(.1),"0.10");
 assert.equal(formatTvRating(1.69),"1.7");
});
