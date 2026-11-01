import test from "node:test";
import assert from "node:assert/strict";
import {assessPromotionSpendingPlan} from "../src/domain/promotion-spending-plan.js";
test("owner limits stay separate from cash and weekly commitments",()=>{
 const plan={weeklyWageLimit:75000,showTalentLimit:150000,cashReserve:2000000};
 const x=assessPromotionSpendingPlan(plan,{cash:5598725,
  weeklyGuarantees:35729,nextShowAppearanceFees:122812});
 assert.equal(x.wageRoom,39271);
 assert.equal(x.showRoom,27188);
 assert.equal(x.unreservedCash,3598725);
 assert.equal(x.reserveAtRisk,false);
});
test("allocations may warn without blocking signed contracts",()=>{
 const x=assessPromotionSpendingPlan({weeklyWageLimit:100,
  showTalentLimit:0,cashReserve:2000},{cash:1500,
  weeklyGuarantees:500,nextShowAppearanceFees:300});
 assert.equal(x.wagePosition,"OVER");
 assert.equal(x.showPosition,"OVER");
 assert.equal(x.reserveAtRisk,true);
});
test("unsafe allocations are rejected",()=>{
 assert.throws(()=>assessPromotionSpendingPlan({weeklyWageLimit:-1,
  showTalentLimit:0,cashReserve:0},{cash:100,weeklyGuarantees:0}));
});
