import test from "node:test";
import assert from "node:assert/strict";
import {recommendPromotionBudgets} from "../src/domain/financial-adviser.js";

test("Talent Manager budgets use real recurring cashflow, payroll and debt without writing anything",()=>{
 const input={cash:5_598_171,debt:0,weeklyMediaIncome:100_000,
  weeklySponsorIncome:29_005,weeklyFixedOverhead:73_596,
  weeklyGuarantees:35_729,weeklyStaffPayroll:5_263,
  recentShowAppearanceFees:15_000,lastWeeklyNet:10_145};
 const result=recommendPromotionBudgets(input);
 assert.equal(result.weeklyIncome,129_005);
 assert.equal(result.weeklyCosts,114_588);
 assert.equal(result.operatingRoom,14_417);
 assert.equal(result.scenarios.length,3);
 const [tight,stable,risky]=result.scenarios.map(x=>x.plan);
 assert.ok(tight.weeklyWageLimit>=input.weeklyGuarantees);
 assert.ok(tight.weeklyWageLimit<stable.weeklyWageLimit);
 assert.ok(stable.weeklyWageLimit<risky.weeklyWageLimit);
 assert.ok(tight.cashReserve>stable.cashReserve);
 assert.ok(stable.cashReserve>risky.cashReserve);
 assert.ok(tight.showTalentLimit<stable.showTalentLimit);
 assert.ok(stable.showTalentLimit<risky.showTalentLimit);
 assert.match(result.summary,/Network and sponsor income 129,005\/week/);
 assert.match(result.summary,/wages, staff and overhead 114,588\/week/);
 assert.match(result.summary,/Operating room 14,417\/week/);
 assert.match(result.summary,/before event costs/);
 const second=recommendPromotionBudgets(input);
 assert.deepEqual(second,result);
});
test("Talent Manager does not advise imaginary savings when income is missing or promotion is distressed",()=>{
 const base={cash:50_000,debt:20_000,weeklyMediaIncome:null,
  weeklySponsorIncome:null,weeklyFixedOverhead:20_000,
  weeklyGuarantees:35_000,weeklyStaffPayroll:10_000,
  recentShowAppearanceFees:0,lastWeeklyNet:-7_000};
 const r=recommendPromotionBudgets(base);
 assert.equal(r.operatingRoom,-65_000);
 assert.equal(r.scenarios[0]!.plan.weeklyWageLimit,35_000);
 assert.match(r.summary,/unconfirmed/);
 for(const x of r.scenarios){
  assert.ok(x.plan.cashReserve<=base.cash);
  assert.ok(x.plan.weeklyWageLimit>=base.weeklyGuarantees);
  assert.ok(x.plan.showTalentLimit>=0);
  assert.ok(x.plan.cashReserve>=0);
 }
});
