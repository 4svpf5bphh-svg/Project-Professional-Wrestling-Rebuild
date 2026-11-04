import assert from "node:assert/strict";
import test from "node:test";
import {forecastCardAppearanceFees,forecastIncrementalAppearanceFees} from "../src/domain/card-appearance-forecast.js";
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

test("incremental preview counts each wrestler once across a match and an angle",()=>{
 const roster=new Map([["joe",{appearanceFee:11000}],
  ["mistico",{appearanceFee:16000}],["guest",{appearanceFee:6000}]]);
 assert.deepEqual(forecastIncrementalAppearanceFees(["joe","mistico"],[],roster),
  {amount:27000,performers:2,unknown:0,complete:true,alreadyBooked:0});
 assert.deepEqual(forecastIncrementalAppearanceFees(
  ["joe","mistico","joe"],["joe","mistico"],roster),
  {amount:0,performers:0,unknown:0,complete:true,alreadyBooked:2});
 assert.deepEqual(forecastIncrementalAppearanceFees(
  ["joe","guest"],["joe","mistico"],roster),
  {amount:6000,performers:1,unknown:0,complete:true,alreadyBooked:1});
});
test("unknown additional fees are not treated as free, but existing ones aren't recharged",()=>{
 assert.deepEqual(forecastIncrementalAppearanceFees(
  ["already","unknown","unknown"],["already"],
  new Map([["already",{appearanceFee:9000}]])),
  {amount:0,performers:1,unknown:1,complete:false,alreadyBooked:1});
 assert.equal(forecastIncrementalAppearanceFees([],["already"],new Map()).performers,0,
  "The caller excludes pre-recorded packages from live fees");
});
