import assert from "node:assert/strict";
import test from "node:test";
import { contractAvailability, type ContractAvailabilityInput } from "../src/domain/contract-availability.js";
const base:ContractAvailabilityInput={family:"LIMITED_NON_EXCLUSIVE",status:"SIGNED",remainingDates:3,expiresWeekIndex:20,currentWeekIndex:10};
test("signed nonexclusive talent can use remaining dates",()=>assert.deepEqual(contractAvailability(base),{available:true,reason:"AVAILABLE"}));
test("zero dates means no bookings even when contract time remains",()=>assert.equal(contractAvailability({...base,remainingDates:0}).reason,"NO_DATES"));
test("term expires after final valid week",()=>{
  assert.equal(contractAvailability({...base,currentWeekIndex:20}).available,true);
  assert.equal(contractAvailability({...base,currentWeekIndex:21}).reason,"EXPIRED");
});
test("exclusive appearances remain unlimited even with legacy finite date counters",()=>{
  assert.equal(contractAvailability({...base,family:"EXCLUSIVE",remainingDates:null}).available,true);
  assert.equal(contractAvailability({...base,family:"EXCLUSIVE",remainingDates:0}).reason,"AVAILABLE");
});
test("one-off requires a date and inactive contract cannot book",()=>{
  assert.equal(contractAvailability({...base,family:"ONE_OFF",remainingDates:null}).reason,"INVALID_CONTRACT");
  assert.equal(contractAvailability({...base,status:"TERMINATED"}).reason,"NOT_SIGNED");
});
