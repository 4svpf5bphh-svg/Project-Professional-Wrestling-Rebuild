import test from "node:test";
import assert from "node:assert/strict";
import {forecastTalentBudget,type BudgetContract} from "../src/domain/talent-budget.js";
const finance={cash:100000,weeklyMediaIncome:10000,weeklySponsorIncome:1000,
 weeklyFixedOverhead:2000,staffPayroll:1000};
const contracts:BudgetContract[]=[
 {personId:"gunn",contractId:"old",family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",
  startWeekIndex:0,expiresWeekIndex:5,remainingDates:1,weeklyGuarantee:2000,appearanceFee:9000},
 {personId:"gunn",contractId:"renew",family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",
  startWeekIndex:6,expiresWeekIndex:10,remainingDates:4,weeklyGuarantee:3000,appearanceFee:8000},
 {personId:"champ",contractId:"other",family:"EXCLUSIVE",status:"SIGNED",
  startWeekIndex:4,expiresWeekIndex:10,remainingDates:null,weeklyGuarantee:4000,appearanceFee:5000}
];
test("future-starting renewals do not double-count current wages or appearances",()=>{
 const x=forecastTalentBudget(contracts,5,finance);
 assert.equal(x.currentGuarantees,6000);
 assert.equal(x.oneShowFullRosterExposure,14000);
 assert.equal(x.futureGuaranteedWages,27000);
 assert.equal(x.scenarioAppearanceFees,53000);
 assert.equal(x.baselineCash,105000);
 assert.equal(x.scenarioCash,52000);
});
test("only contracted available dates can generate speculative appearances",()=>{
 const x=forecastTalentBudget(contracts.slice(0,1),5,finance);
 assert.equal(x.scenarioAppearanceFees,9000);
 assert.equal(x.futureGuaranteedWages,2000);
});
test("unknown recurring income cannot create an invented cash forecast",()=>{
 const x=forecastTalentBudget(contracts,5,{...finance,weeklySponsorIncome:null});
 assert.equal(x.baselineCash,null);assert.equal(x.scenarioCash,null);
 assert.throws(()=>forecastTalentBudget(contracts,-1,finance),/Invalid/);
});
