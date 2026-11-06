import test from "node:test";
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
 const x=assessBroadcastNetwork(deal,[ep(14,1.7)],14)!;
 assert.equal(x.target,1.69);assert.equal(x.status,"ON_TARGET");
 assert.equal(x.bonusEligible,true);assert.equal(x.missedConsecutively,0);
 assert.match(broadcasterReaction(x),/Prime time/);
 assert.equal(assessBroadcastNetwork(deal,[],9),null);
});
test("three consecutive below-target episodes trigger a replay-stable warning",()=>{
 const a=[ep(12,.7),ep(13,.8),ep(14,.9)];
 const x=assessBroadcastNetwork(deal,a,14)!;
 assert.equal(x.status,"BELOW_TARGET");assert.equal(x.milestone,"WARNING");
 assert.equal(x.missedConsecutively,3);assert.equal(x.previousMisses,2);
 assert.equal(x.bonusEligible,false);
 assert.deepEqual(assessBroadcastNetwork(deal,a,14),x);
 assert.equal(assessBroadcastNetwork(deal,a.slice(0,2),13)!.milestone,null);
});
test("moving a show outside the signed airtime loses only the performance bonus",()=>{
 const x=assessBroadcastNetwork(deal,[ep(15,3.1,6)],15)!;
 assert.equal(x.status,"OFF_SLOT");assert.equal(x.bonusEligible,false);
 assert.match(broadcasterReaction(x),/prime-time slot/);
 assert.equal(assessBroadcastNetwork({...deal,airingDay:null},[ep(15,3.1,6)],15)!.status,"ON_TARGET");
});
test("recovered high-rating shows earn a positive network statement",()=>{
 const a=[ep(14,.6),ep(15,.8),ep(16,.9),ep(17,2.1)];
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
