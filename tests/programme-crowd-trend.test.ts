import test from "node:test";
import assert from "node:assert/strict";
import {readProgrammeCrowdTrend} from "../src/domain/programme-crowd-trend.js";

test("certified feud crowd trajectory is measured by distinct show weeks, not slot count",()=>{
 const first=readProgrammeCrowdTrend([
  {weekIndex:7,crowdResponse:80},
  {weekIndex:8,crowdResponse:90},
  {weekIndex:8,crowdResponse:74}
 ]);
 assert.deepEqual(first,{weekIndex:8,latestCrowd:82,priorWeekIndex:7,
  priorCrowd:80,delta:2,direction:"STEADY"});
 assert.deepEqual(readProgrammeCrowdTrend([
  {weekIndex:6,crowdResponse:72},{weekIndex:7,crowdResponse:85}
 ]),{weekIndex:7,latestCrowd:85,priorWeekIndex:6,priorCrowd:72,
  delta:13,direction:"RISING"});
 assert.deepEqual(readProgrammeCrowdTrend([
  {weekIndex:7,crowdResponse:81},{weekIndex:8,crowdResponse:72}
 ]),{weekIndex:8,latestCrowd:72,priorWeekIndex:7,priorCrowd:81,
  delta:-9,direction:"COOLING"});
});
test("the first certified week is a measurement, never a fabricated growth trend",()=>{
 assert.equal(readProgrammeCrowdTrend([]),null);
 assert.deepEqual(readProgrammeCrowdTrend([
  {weekIndex:10,crowdResponse:50},{weekIndex:10,crowdResponse:100}
 ]),{weekIndex:10,latestCrowd:75,priorWeekIndex:null,
  priorCrowd:null,delta:null,direction:"FIRST"});
 for(const bad of [NaN,Infinity,-1,101]){
  assert.throws(()=>readProgrammeCrowdTrend([
   {weekIndex:5,crowdResponse:bad}
  ]),/Invalid certified/);
 }
});
