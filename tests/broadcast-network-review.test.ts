import test from "node:test";
import {projectShowAudience} from "../src/domain/show-audience.js";
import {broadcasterRatingTarget,formatTvRating} from "../src/domain/commercial-offers.js";
import assert from "node:assert/strict";
import {assessBroadcastNetwork,broadcasterReaction,broadcastScheduleLabel,
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
 const local=at("LOCAL","BROADCAST_STABLE",audience("LOCAL",40));
 const lowReach=at("LOCAL","BROADCAST_STABLE",audience("LOCAL",20));
 const indie=at("INDEPENDENT","BROADCAST_INDIE",audience("INDEPENDENT",35));
 const rising=at("RISING","BROADCAST_GROWTH",audience("RISING",45));
 assert.equal(local.rating,.07);
 assert.equal(lowReach.rating,.05);
 assert.equal(lowReach.status,"BELOW_TARGET");
 assert.equal(indie.rating,.12);
 assert.ok(rising.rating!>=.28&&rising.rating!<.34);
 assert.equal(local.status,"ON_TARGET");
 assert.equal(indie.status,"ON_TARGET");
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

test("alternate-week broadcaster obligations skip legitimate off-weeks and count only due broadcasts",()=>{
 const fortnight={...deal,startWeekIndex:20,endWeekIndex:45,
  regularSchedule:[{cadenceWeeks:2,anchorWeek:20}]};
 const noShow=assessBroadcastNetwork(fortnight,[],21)!;
 assert.equal(noShow.status,"OFF_WEEK");
 assert.equal(noShow.missedConsecutively,1,
  "The week 20 missed episode persists, but week 21 cannot add a second miss");
 assert.equal(noShow.milestone,null);
 assert.equal(noShow.bonusEligible,false);
 assert.match(broadcasterReaction(noShow),/No broadcast was due/);
 const episodes=[ep(20,.4),ep(22,.4),ep(24,.4)];
 const third=assessBroadcastNetwork(fortnight,episodes,24)!;
 assert.equal(third.missedConsecutively,3);
 assert.equal(third.milestone,"WARNING");
 const gap=assessBroadcastNetwork(fortnight,episodes,25)!;
 assert.equal(gap.status,"OFF_WEEK");
 assert.equal(gap.missedConsecutively,3);
 assert.equal(gap.milestone,null);
 const recovery=assessBroadcastNetwork(fortnight,[...episodes,ep(26,2)],26)!;
 assert.equal(recovery.milestone,"RECOVERED");
 assert.equal(recovery.status,"ON_TARGET");
 const healthy=assessBroadcastNetwork(fortnight,[ep(20,2),ep(22,2)],23)!;
 assert.equal(healthy.status,"OFF_WEEK");
 assert.equal(healthy.missedConsecutively,0);
 // A World with two alternating TV brands still has weekly obligations.
 const twoSeries={...fortnight,regularSchedule:[
  {cadenceWeeks:2,anchorWeek:20},{cadenceWeeks:2,anchorWeek:21}]};
 assert.equal(assessBroadcastNetwork(twoSeries,[],21)!.status,"NO_TV");
});

test("long-cycle regular schedules use the same valid 260-week cadence as the calendar",()=>{
 const rare={...deal,startWeekIndex:0,endWeekIndex:52,
  regularSchedule:[{cadenceWeeks:104,anchorWeek:1}]};
 assert.equal(assessBroadcastNetwork(rare,[],0)!.status,"OFF_WEEK");
 assert.equal(assessBroadcastNetwork(rare,[ep(1,2)],1)!.status,"ON_TARGET");
 assert.equal(assessBroadcastNetwork(rare,[ep(1,2)],2)!.missedConsecutively,0,
  "An off-week does not erase a duly certified previous broadcast");
 assert.equal(assessBroadcastNetwork(rare,[],2)!.missedConsecutively,1,
  "A genuinely missed scheduled episode remains missed on the off-week");
 assert.throws(()=>assessBroadcastNetwork({...rare,regularSchedule:[
  {cadenceWeeks:0,anchorWeek:4}]},[],1),/Invalid/);
});

test("network desk describes actual recurrence without implying an off-week violation",()=>{
 const {regularSchedule}=({regularSchedule:[{cadenceWeeks:2,anchorWeek:20}]});
 assert.equal(broadcastScheduleLabel(regularSchedule),"Every other week");
 assert.equal(broadcastScheduleLabel([{cadenceWeeks:1,anchorWeek:20}]),"Weekly TV");
 assert.equal(broadcastScheduleLabel([{cadenceWeeks:5,anchorWeek:20}]),"Every 5 weeks");
 assert.equal(broadcastScheduleLabel([{cadenceWeeks:2,anchorWeek:20},
  {cadenceWeeks:2,anchorWeek:21}]),"Multiple TV series");
 assert.equal(broadcastScheduleLabel(undefined),"Weekly TV");
});

test("a low-reach independent deal cannot demand a rating beyond its distribution",()=>{
 const network={...deal,tier:"INDEPENDENT",offerCode:"BROADCAST_STABLE",agreedReach:15};
 assert.equal(broadcasterRatingTarget(network.offerCode,network.tier),.10);
 const strong=assessBroadcastNetwork(network,[ep(15,.09)],15)!;
 const weak=assessBroadcastNetwork(network,[ep(15,.06)],15)!;
 assert.equal(strong.target,.09);
 assert.equal(strong.status,"ON_TARGET");
 assert.equal(weak.status,"BELOW_TARGET");
 assert.equal(broadcasterRatingTarget("BROADCAST_TV","NATIONAL",15),1.69);
});
