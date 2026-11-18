import test from "node:test";
import assert from "node:assert/strict";
import {recommendProgrammeAngles} from "../src/domain/programme-angle-recommendations.js";
import {SEGMENT_BOOKING_RULES} from "../src/domain/segment-booking.js";

const base={heat:58,repetition:22,latestFollowUp:null};
test("all suggested angles are existing, castable segment types",()=>{
 for(const sample of [
  base,{...base,heat:null,repetition:0},{...base,heat:85},
  {...base,repetition:81},
  {...base,latestFollowUp:{choice:"PLAN_RETALIATION" as const,nextAngleWeekIndex:null}},
  {...base,latestFollowUp:{choice:"PURSUE_REMATCH" as const,nextMatchWeekIndex:null}}
 ]){
  const results=recommendProgrammeAngles(sample);
  assert.equal(results.length,3);
  assert.equal(new Set(results.map(x=>x.kind)).size,3);
  for(const item of results){
   assert.ok(item.title&&item.reason);
   assert.ok(item.minutes>=1&&item.minutes<=30);
   assert.ok(SEGMENT_BOOKING_RULES[item.kind]);
   assert.doesNotMatch(item.reason,/guaranteed winner|will lose|auto.book/i);
  }
 }
});

test("pending retaliation suggests on-screen alternatives rather than replaying the bout",()=>{
 const ideas=recommendProgrammeAngles({...base,latestFollowUp:{
  choice:"PLAN_RETALIATION",laterAngleRecorded:false}});
 assert.equal(ideas[0]?.kind,"CONFRONTATION");
 assert.equal(ideas[1]?.kind,"ATTACK");
 assert.match(ideas[0]!.reason,/response/);
 const followed=recommendProgrammeAngles({...base,latestFollowUp:{
  choice:"PLAN_RETALIATION",laterAngleRecorded:true}});
 assert.notEqual(followed[1]?.kind,"ATTACK");
});

test("pending rematch selects a challenge and contract signing, not a secretly booked finish",()=>{
 const ideas=recommendProgrammeAngles({...base,latestFollowUp:{
  choice:"PURSUE_REMATCH",laterMatchRecorded:false}});
 assert.deepEqual(ideas.map(x=>x.kind),["CHALLENGE","CONTRACT_SIGNING","VIDEO_PACKAGE"]);
 assert.ok(ideas.every(x=>!JSON.stringify(x).includes("scriptedWinner")));
 assert.notEqual(recommendProgrammeAngles({...base,latestFollowUp:{
  choice:"PURSUE_REMATCH",laterMatchRecorded:true}})[0]?.kind,"CHALLENGE");
});

test("repetition, hot interest and cold stories receive distinct advice",()=>{
 assert.deepEqual(recommendProgrammeAngles({...base,repetition:60}).map(x=>x.kind),
  ["VIDEO_PACKAGE","INTERVIEW","CHALLENGE"]);
 assert.equal(recommendProgrammeAngles({...base,heat:90})[0]?.kind,"CONTRACT_SIGNING");
 assert.equal(recommendProgrammeAngles({...base,heat:15})[0]?.kind,"INTERVIEW");
});

test("solo, mentor and faction stories suggest castable scenes without inventing a feud",()=>{
 const cases=[
  {programmeFormat:"SOLO" as const,opening:["INTERVIEW","PROMO","VIDEO_PACKAGE"],
   next:["INTERVIEW","PROMO","VIDEO_PACKAGE"]},
  {programmeFormat:"RELATIONSHIP" as const,opening:["INTERVIEW","PROMO","CELEBRATION"],
   next:["INTERVIEW","CELEBRATION","VIDEO_PACKAGE"]},
  {programmeFormat:"FACTION" as const,opening:["PROMO","INTERVIEW","CELEBRATION"],
   next:["INTERVIEW","PROMO","VIDEO_PACKAGE"]}
 ];
 for(const sample of cases){
  const opening=recommendProgrammeAngles({...base,programmeFormat:sample.programmeFormat,activityCount:0});
  const developed=recommendProgrammeAngles({...base,programmeFormat:sample.programmeFormat,activityCount:4});
  assert.deepEqual(opening.map(x=>x.kind),sample.opening);
  assert.deepEqual(developed.map(x=>x.kind),sample.next);
  for(const item of [...opening,...developed]){
   assert.ok(SEGMENT_BOOKING_RULES[item.kind]);
   assert.doesNotMatch(item.reason,
    /they betrayed|they already|won the title|automatically booked|guaranteed a win/i);
  }
 }
 const old=recommendProgrammeAngles({...base,activityCount:0});
 const original=recommendProgrammeAngles({...base,programmeFormat:"RIVALRY",activityCount:0});
 assert.deepEqual(original,old,"Rivalry recommendations remain identical");
});

test("a chosen certified-story follow-up changes the actual next booking starters",()=>{
 const format="FACTION" as const;
 const ideas=(choice:"BUILD_ON_REACTION"|"CHANGE_PRESENTATION"|"SLOW_BURN")=>
  recommendProgrammeAngles({...base,programmeFormat:format,activityCount:2,
   creativeIntent:{followUp:{choice,sourceShowId:"certified-show",
    sourceSlotId:"performed-scene",sourceWeekIndex:6}}});
 assert.deepEqual(ideas("BUILD_ON_REACTION").map(x=>x.kind),
  ["PROMO","INTERVIEW","VIDEO_PACKAGE"]);
 assert.deepEqual(ideas("CHANGE_PRESENTATION").map(x=>x.kind),
  ["VIDEO_PACKAGE","INTERVIEW","PROMO"]);
 assert.deepEqual(ideas("SLOW_BURN").map(x=>x.kind),
  ["VIDEO_PACKAGE","INTERVIEW","PROMO"]);
 for(const choice of ["BUILD_ON_REACTION","CHANGE_PRESENTATION","SLOW_BURN"] as const){
  for(const suggestion of ideas(choice)){
   assert.ok(SEGMENT_BOOKING_RULES[suggestion.kind]);
   assert.doesNotMatch(suggestion.reason,/already betrayed|automatically|will win|confirmed split/i);
  }
 }
 // Original rivalries cannot be steered by non-rival creative replies.
 assert.deepEqual(recommendProgrammeAngles({...base,programmeFormat:"RIVALRY",
  creativeIntent:{followUp:{choice:"SLOW_BURN",sourceShowId:"s",
   sourceSlotId:"x",sourceWeekIndex:2}}}),recommendProgrammeAngles({...base,programmeFormat:"RIVALRY"}));
});

test("a later certified chapter retires an old follow-up recommendation",()=>{
 const authored={choice:"BUILD_ON_REACTION" as const,
  sourceShowId:"first",sourceSlotId:"original-angle",sourceWeekIndex:3};
 const withSource={...base,programmeFormat:"SOLO" as const,activityCount:4,
  creativeIntent:{followUp:authored}};
 assert.equal(recommendProgrammeAngles({...withSource,
  recentActivity:[{kind:"SEGMENT",showId:"first",slotId:"original-angle"}]})[0]?.kind,
  "PROMO");
 assert.deepEqual(recommendProgrammeAngles({...withSource,
  recentActivity:[{kind:"SEGMENT",showId:"second",slotId:"another-angle"}]})
  .map(x=>x.kind),recommendProgrammeAngles({...base,programmeFormat:"SOLO",
   activityCount:4,recentActivity:[{kind:"SEGMENT",showId:"second",
    slotId:"another-angle"}]}).map(x=>x.kind));
});
