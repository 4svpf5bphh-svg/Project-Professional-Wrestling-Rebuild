import test from "node:test";
import assert from "node:assert/strict";
import {remainingRosterExposure} from "../src/domain/remaining-contract-exposure.js";

test("ten one-year talent deals show a meaningful roster-wide budget envelope",()=>{
 const exposure=remainingRosterExposure(Array.from({length:10},()=>({
  weeksRemaining:52,remainingDates:40,weeklyGuarantee:5000,
  appearanceFee:6000
 })));
 assert.equal(exposure.guaranteedWages,2_600_000);
 assert.equal(exposure.optionalAppearanceFees,2_400_000);
 assert.equal(exposure.potentialTotal,5_000_000);
 assert.equal(exposure.remainingUsableDates,400);
});
test("expired terms, already-used dates, and exclusive dates are not charged twice",()=>{
 const exposure=remainingRosterExposure([
  {weeksRemaining:4,remainingDates:2,weeklyGuarantee:1000,appearanceFee:500},
  {weeksRemaining:7,remainingDates:null,weeklyGuarantee:1250,appearanceFee:0},
  {weeksRemaining:0,remainingDates:15,weeklyGuarantee:1000,appearanceFee:800},
  {weeksRemaining:2,remainingDates:8,weeklyGuarantee:0,appearanceFee:450}
 ]);
 assert.equal(exposure.guaranteedWages,12750);
 assert.equal(exposure.optionalAppearanceFees,1900);
 assert.equal(exposure.remainingUsableDates,4);
});
