import assert from "node:assert/strict";
import test from "node:test";
import {contractDeskEntry} from "../src/domain/contract-desk.js";
const base={contractId:"c1",personId:"w1",name:"Worker",family:"LIMITED_NON_EXCLUSIVE" as const,
 status:"SIGNED" as const,remainingDates:3,expiresWeekIndex:20,currentWeekIndex:10};
test("active non-exclusive deal offers additional dates and renewal",()=>{
 const r=contractDeskEntry(base);
 assert.equal(r.availableForBooking,true);
 assert.equal(r.additionalDatesEligible,true);
 assert.equal(r.renewalEligible,true);
 assert.equal(r.needsAttention,false);
});
test("zero remaining dates raises attention without terminating the agreement",()=>{
 const r=contractDeskEntry({...base,remainingDates:0});
 assert.equal(r.availableForBooking,false);
 assert.equal(r.reason,"NO_DATES");
 assert.equal(r.needsAttention,true);
 assert.equal(r.additionalDatesEligible,true);
});
test("final four weeks flag expiry including the final bookable week",()=>{
 assert.equal(contractDeskEntry({...base,currentWeekIndex:17}).weeksRemaining,4);
 assert.equal(contractDeskEntry({...base,currentWeekIndex:17}).expiringSoon,true);
 assert.equal(contractDeskEntry({...base,currentWeekIndex:20}).availableForBooking,true);
});
test("exclusive contracts preserve unlimited booking and no date purchase",()=>{
 const r=contractDeskEntry({...base,family:"EXCLUSIVE",remainingDates:0});
 assert.equal(r.availableForBooking,true);
 assert.equal(r.additionalDatesEligible,false);
 assert.equal(r.renewalEligible,true);
});
test("expired and terminated agreements do not offer negotiation actions",()=>{
 const expired=contractDeskEntry({...base,currentWeekIndex:21});
 assert.equal(expired.renewalEligible,false);
 assert.equal(expired.additionalDatesEligible,false);
 const terminated=contractDeskEntry({...base,status:"TERMINATED"});
 assert.equal(terminated.renewalEligible,false);
 assert.equal(terminated.additionalDatesEligible,false);
});
test("one-off contract does not offer multiweek renewal",()=>{
 assert.equal(contractDeskEntry({...base,family:"ONE_OFF"}).renewalEligible,false);
});
