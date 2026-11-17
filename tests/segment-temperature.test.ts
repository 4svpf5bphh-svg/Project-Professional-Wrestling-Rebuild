import test from "node:test";
import assert from "node:assert/strict";
import {segmentTemperature} from "../src/domain/segment-temperature.js";

test("segment temperature follows actual certified five-star execution",()=>{
 const checks:[number,string,string][]=[
  [0,"Freezing Cold","cold"],[0.99,"Freezing Cold","cold"],
  [1,"Cool","cool"],[1.99,"Cool","cool"],
  [2,"Mild","mild"],[2.99,"Mild","mild"],
  [3,"Warming Up","warm"],[3.74,"Warming Up","warm"],
  [3.75,"Hot","hot"],[4.49,"Hot","hot"],
  [4.5,"Boiling","boiling"],[5,"Boiling","boiling"]
 ];
 for(const [stars,label,tone] of checks){
  const result=segmentTemperature(stars);
  assert.equal(result?.label,label);
  assert.equal(result?.tone,tone);
  assert.ok(result?.description);
 }
});
test("no fictitious temperature for absent or invalid scores",()=>{
 assert.equal(segmentTemperature(null),null);
 assert.equal(segmentTemperature(undefined),null);
 assert.equal(segmentTemperature(NaN),null);
 assert.equal(segmentTemperature(Infinity),null);
 assert.equal(segmentTemperature(-Infinity),null);
 assert.equal(segmentTemperature(-2)?.label,"Freezing Cold");
 assert.equal(segmentTemperature(7)?.label,"Boiling");
});
