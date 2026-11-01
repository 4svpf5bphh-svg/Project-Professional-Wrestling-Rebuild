import assert from "node:assert/strict";
import test from "node:test";
import {forecastCardAppearanceFees} from "../src/domain/card-appearance-forecast.js";
test("matches, segments and run-ins share one conditional appearance",()=>{
 const roster=new Map([["gunn",{appearanceFee:9000}],["riddle",{appearanceFee:8000}]]);
 assert.deepEqual(forecastCardAppearanceFees(["gunn","gunn","riddle","gunn"],roster),
  {amount:17000,performers:2,unknown:0,complete:true});
});
test("an unknown signed fee must not be claimed as zero",()=>{
 assert.deepEqual(forecastCardAppearanceFees(["free","missing","missing"],
  new Map([["free",{appearanceFee:0}]])),
  {amount:0,performers:2,unknown:1,complete:false});
});
