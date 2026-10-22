import test from "node:test";
import assert from "node:assert/strict";
import {originalEmergencyAcceptance} from "../src/db/living-world-promotions.js";
test("emergency recruitment decisions are deterministic and independent of sign-on",()=>{
 const p={money:40,role:80,prestige:50,schedule:50,loyalty:50,exposure:95};
 assert.equal(originalEmergencyAcceptance(123,52,"aew","prospect-1",p),
  originalEmergencyAcceptance(123,52,"aew","prospect-1",p));
 const series=Array.from({length:32},(_,i)=>
  originalEmergencyAcceptance(123,52,"rival","available-"+i,p));
 assert.ok(series.some(Boolean));assert.ok(series.some(x=>!x));
});
