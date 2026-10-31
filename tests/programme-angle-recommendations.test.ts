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
