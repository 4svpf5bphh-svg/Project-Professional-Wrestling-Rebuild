import test from "node:test";
import assert from "node:assert/strict";
import {storyBlueprint} from "../src/domain/story-blueprints.js";
import {readProgrammeBlueprintProgress}
 from "../src/domain/programme-blueprint-progress.js";
const betrayal=storyBlueprint("BETRAYAL")!;
test("only proven performed scenes complete exact kind/purpose beats",()=>{
 const progress=readProgrammeBlueprintProgress(betrayal,[
  {beatId:"hint",weekIndex:14,crowdResponse:76.5},
  {beatId:"choice",weekIndex:null,crowdResponse:null}
 ],[
  {kind:"SEGMENT",segmentKind:"RESCUE",scenePurpose:"EARN_TRUST",
   year:1,week:19,showName:"CWA Ascension",status:"DRAFT"},
  {kind:"MATCH",segmentKind:null,scenePurpose:null,
   year:1,week:20,showName:"Extreme Warfare",status:"SUBMITTED"},
  {kind:"SEGMENT",segmentKind:"TURN",scenePurpose:"EXPLAIN_TURN",
   year:1,week:22,showName:"Extreme Warfare",status:"DRAFT"}
 ]);
 assert.deepEqual(progress.beats.map(x=>x.status),["PLAYED","BOOKED","AVAILABLE"]);
 assert.equal(progress.played,1);
 assert.equal(progress.booked,1);
 assert.equal(progress.available,1);
 assert.equal(progress.suggestedBeatId,"choice");
 assert.deepEqual(progress.beats[0]?.playedWeekIndex,14);
 assert.equal(progress.beats[0]?.crowdResponse,76.5);
 assert.deepEqual(progress.beats[1]?.bookedAt,{
  year:1,week:19,showName:"CWA Ascension",submitted:false
 });
});
test("a certified performance outranks a still-linked submitted card",()=>{
 const x=readProgrammeBlueprintProgress(betrayal,[
  {beatId:"hint",weekIndex:8,crowdResponse:80}
 ],[{kind:"SEGMENT",segmentKind:"INTERVIEW",scenePurpose:"TEASE_BETRAYAL",
  year:1,week:9,showName:"CWA Ascension",status:"SUBMITTED"}]);
 assert.equal(x.beats[0]?.status,"PLAYED");
 assert.equal(x.beats[0]?.bookedAt,null);
});
test("unsaved suggestions, mismatched purposes and fake results do not earn progress",()=>{
 const missing=readProgrammeBlueprintProgress(betrayal,[
  {beatId:"hint",weekIndex:null,crowdResponse:null},
  {beatId:"choice",weekIndex:9,crowdResponse:Number.NaN}
 ],[
  {kind:"SEGMENT",segmentKind:"INTERVIEW",scenePurpose:"BUILD_CHARACTER",
   year:1,week:7,showName:"CWA",status:"DRAFT"}]);
 assert.equal(missing.played,0);
 assert.equal(missing.booked,0);
 assert.deepEqual(missing.beats.map(x=>x.status),
  ["AVAILABLE","AVAILABLE","AVAILABLE"]);
 assert.equal(missing.suggestedBeatId,"hint");
});
test("the booker can return to a performed beat without an automatic outcome",()=>{
 const x=readProgrammeBlueprintProgress(betrayal,
  betrayal.beats.map((b,i)=>({beatId:b.id,weekIndex:8+i,crowdResponse:50+i*7})),[]);
 assert.equal(x.played,3);
 assert.equal(x.suggestedBeatId,null);
 assert.equal(x.available,0);
 assert.ok(x.beats.every(b=>b.status==="PLAYED"));
});
