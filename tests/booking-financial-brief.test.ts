import test from "node:test";
import assert from "node:assert/strict";
import {bookingFinanceBrief,type BookingFinanceSnapshot}
 from "../src/domain/booking-financial-brief.js";
import {forecastCardAppearanceFees,forecastIncrementalAppearanceFees}
 from "../src/domain/card-appearance-forecast.js";
const baseline:BookingFinanceSnapshot={
 currentWeekIndex:6,cash:200000,media:12000,sponsor:7000,
 overhead:5000,wages:9000,staff:3000,
 showTalentLimit:15000,cashReserve:100000
};
test("4- and 8-week booking baseline deducts exactly one show, not repeated angle or run-in charges",()=>{
 const roster=new Map([["joe",{appearanceFee:6000}],["mistico",{appearanceFee:5000}]]);
 const fees=forecastCardAppearanceFees(["joe","mistico","joe","joe"],roster);
 assert.equal(fees.amount,11000);
 const result=bookingFinanceBrief(baseline,fees,7)!;
 assert.equal(result.weeklyGuaranteedOutgoings,12000);
 assert.equal(result.weeklyFixedMargin,2000);
 assert.equal(result.fourWeeks,200000+4*2000-11000);
 assert.equal(result.eightWeeks,200000+8*2000-11000);
 assert.equal(result.breachesTalentLimit,false);
 const incremental=forecastIncrementalAppearanceFees(["joe"],["mistico","joe"],roster);
 assert.equal(incremental.amount,0);
 assert.equal(incremental.alreadyBooked,1);
});
test("4-week outlook does not prematurely charge a show scheduled in week six",()=>{
 const result=bookingFinanceBrief(baseline,{amount:13000,performers:2,
  unknown:0,complete:true},baseline.currentWeekIndex+5)!;
 assert.equal(result.fourWeeks,208000);
 assert.equal(result.eightWeeks,203000);
});
test("show limit, reserve and unknown contractual fees remain separate warnings",()=>{
 const cap=bookingFinanceBrief({...baseline,cash:108000},
  {amount:17000,performers:3,unknown:0,complete:true},6)!;
 assert.equal(cap.breachesTalentLimit,true);
 assert.equal(cap.mayBreachTalentLimit,false);
 assert.equal(cap.projectedBelowReserve,true);
 const uncertain=bookingFinanceBrief(baseline,
  {amount:7000,performers:3,unknown:1,complete:false},6)!;
 assert.equal(uncertain.breachesTalentLimit,false);
 assert.equal(uncertain.mayBreachTalentLimit,true);
 const loss=bookingFinanceBrief({...baseline,cash:-12000,showTalentLimit:null,
  cashReserve:null},{amount:0,performers:0,unknown:0,complete:true},6)!;
 assert.equal(loss.fourWeeks,-4000);
 assert.equal(loss.talentLimit,null);
});
test("missing income is never silently assumed to be a solvent projection",()=>{
 const result=bookingFinanceBrief({...baseline,sponsor:null},
  {amount:4000,performers:1,unknown:0,complete:true},6)!;
 assert.equal(result.weeklyFixedMargin,null);
 assert.equal(result.fourWeeks,null);
 assert.equal(result.eightWeeks,null);
 assert.equal(bookingFinanceBrief(null,{amount:0,performers:0,
  unknown:0,complete:true},6),null);
});
