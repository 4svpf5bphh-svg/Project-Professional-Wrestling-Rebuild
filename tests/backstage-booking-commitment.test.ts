import test from "node:test";
import assert from "node:assert/strict";
import {describeBookingCommitment} from "../src/domain/backstage-booking-commitment.js";

const base={decision:"PROMISE_APPEARANCE",status:"PROMISED",
 dueWeekIndex:8,assessmentReason:null,trustDelta:0};
test("a draft or submitted booking never claims to fulfil the wrestler's promise",()=>{
 const empty=describeBookingCommitment(base,6)!;
 assert.equal(empty.stage,"UNBOOKED");
 assert.match(empty.detail,/Only a certified appearance/);
 const scheduled=describeBookingCommitment({...base,plannedBooking:{
  showName:"CWA Ascension",year:1,week:8,status:"DRAFT",kind:"MATCH"}},6)!;
 assert.equal(scheduled.stage,"PLANNED");
 assert.match(scheduled.detail,/draft/);
 assert.match(scheduled.detail,/only counts after the show is certified/i);
 assert.equal(scheduled.canReviewBooking,true);
 const confirmed=describeBookingCommitment({...base,plannedBooking:{
  showName:"CWA Ascension",year:1,week:8,status:"SUBMITTED",kind:"MATCH"}},6)!;
 assert.match(confirmed.detail,/confirmed/);
 assert.equal(confirmed.stage,"PLANNED");
 const angleDoesNotSatisfy=describeBookingCommitment({...base,plannedBooking:{
  showName:"CWA Ascension",year:1,week:8,status:"DRAFT",kind:"SEGMENT"}},6)!;
 assert.equal(angleDoesNotSatisfy.stage,"UNBOOKED");
});
test("a medically interrupted match is excused, but a missed show affects trust",()=>{
 const broken=describeBookingCommitment({...base,status:"BROKEN",
  assessmentReason:"UNFULFILLED_COMMITMENT",trustDelta:-3},9)!;
 assert.equal(broken.stage,"BROKEN");assert.match(broken.detail,/trust -3/);
 const excused=describeBookingCommitment({...base,status:"EXCUSED",
  assessmentReason:"MEDICAL_UNAVAILABLE"},9)!;
 assert.equal(excused.stage,"EXCUSED");assert.match(excused.detail,/certified injury/);
 assert.match(excused.detail,/No trust penalty/);
 const kept=describeBookingCommitment({...base,status:"FULFILLED"},9)!;
 assert.equal(kept.stage,"FULFILLED");assert.match(kept.detail,/completed, certified show/);
});
test("no declined or merely discussed request becomes a phantom booking debt",()=>{
 for(const choice of ["TALK","DECLINE","EXPLORE_RIVALRY"]){
  assert.equal(describeBookingCommitment({...base,decision:choice},6),null);
 }
 assert.equal(describeBookingCommitment({...base,status:"DECLINED"},6),null);
 const promo=describeBookingCommitment({...base,decision:"PROMISE_SEGMENT",
  plannedBooking:{showName:"Ascension",year:1,week:9,status:"DRAFT",kind:"SEGMENT"}},6)!;
 assert.equal(promo.stage,"PLANNED");
 assert.match(promo.headline,/Promo/);
});
