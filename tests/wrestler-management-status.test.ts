import test from "node:test";
import assert from "node:assert/strict";
import {wrestlerManagementStatus} from "../src/ui/wrestler-management-status.js";
const base={
 status:"ACTIVE",currentWeekIndex:20,medicalWeeksRemaining:null,
 contracts:[{isYours:true,startWeekIndex:2,expiresWeekIndex:24,remainingDates:3}]
};
test("signed roster is a current-week snapshot, not a pre-approved future booking",()=>{
 const status=wrestlerManagementStatus(base);
 assert.equal(status.kind,"SIGNED");
 assert.match(status.detail,/actual show week/);
});
test("medical absence and exhausted dates take precedence over a signed label",()=>{
 assert.equal(wrestlerManagementStatus({...base,medicalWeeksRemaining:2}).kind,"MEDICAL");
 assert.equal(wrestlerManagementStatus({...base,contracts:[
  {...base.contracts[0]!,remainingDates:0}]}).kind,"NO_DATES");
});
test("future renewal cannot be presented as current appearance permission",()=>{
 const next=wrestlerManagementStatus({...base,contracts:[
  {...base.contracts[0]!,startWeekIndex:23}]});
 assert.equal(next.kind,"FUTURE");
 assert.match(next.detail,/3 weeks/);
});
test("unsiged and inactive wrestlers do not claim current booking eligibility",()=>{
 assert.equal(wrestlerManagementStatus({...base,contracts:[]}).kind,"UNSIGNED");
 assert.equal(wrestlerManagementStatus({...base,status:"RETIRED"}).kind,"INACTIVE");
});
