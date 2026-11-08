/** A private booking promise projected from its actual decision, the next
 * draft card and certified settlement. Drafts never satisfy a promise and
 * medical interruptions never masquerade as a broken word.
 */
export type BookingPromiseDecision="PROMISE_APPEARANCE"|"PROMISE_SEGMENT"|"PROMISE_FEATURED";
export interface UpcomingPromiseBooking{
 showName:string;year:number;week:number;status:string;kind:string;
}
export interface PromiseEvidence{
 decision:string|null;status:string;dueWeekIndex:number|null;
 assessmentReason:string|null;trustDelta:number;
 plannedBooking?:UpcomingPromiseBooking|null;
}
export interface PromiseChapter{
 headline:string;detail:string;canReviewBooking:boolean;
 stage:"UNBOOKED"|"PLANNED"|"FULFILLED"|"BROKEN"|"EXCUSED";
}
const when=(weekIndex:number)=>"Y"+(Math.floor(weekIndex/52)+1)+
 " W"+(weekIndex%52+1);
const name=(decision:BookingPromiseDecision)=>decision==="PROMISE_SEGMENT"?
 "Promo/angle":decision==="PROMISE_FEATURED"?"Featured match":"Match";
const isBookingPromise=(value:string|null):value is BookingPromiseDecision=>
 value==="PROMISE_APPEARANCE"||value==="PROMISE_SEGMENT"||
 value==="PROMISE_FEATURED";
export function describeBookingCommitment(input:PromiseEvidence,
 currentWeekIndex:number):PromiseChapter|null{
 if(!isBookingPromise(input.decision))return null;
 const due=input.dueWeekIndex!==null&&Number.isSafeInteger(input.dueWeekIndex)&&
  input.dueWeekIndex>=0?" · due "+when(input.dueWeekIndex):"";
 const kind=name(input.decision);
 const countdown=input.dueWeekIndex!==null&&Number.isSafeInteger(currentWeekIndex)&&
  currentWeekIndex>=0?" · "+Math.max(0,input.dueWeekIndex-currentWeekIndex)+
  " weeks remaining":"";
 if(input.status==="FULFILLED")return {
  stage:"FULFILLED",headline:kind+" delivered",
  detail:"A completed, certified show fulfilled this booking commitment.",
  canReviewBooking:false};
 if(input.status==="BROKEN")return {
  stage:"BROKEN",headline:kind+" commitment missed",
  detail:"No qualifying completed appearance by the deadline."+
   (input.trustDelta<0?" Promotion trust "+input.trustDelta+".":""),
  canReviewBooking:false};
 if(input.status==="EXCUSED")return {
  stage:"EXCUSED",headline:"Booking commitment excused",
  detail:input.assessmentReason==="MEDICAL_UNAVAILABLE"?
   "A certified injury prevented the promised in-ring appearance. No trust penalty.":
   input.assessmentReason==="NO_COMPLETED_SHOW"?
   "No show was completed in the delivery window. No trust penalty.":
   input.assessmentReason==="CONTRACT_UNAVAILABLE"?
   "Valid contracted appearances were unavailable. No trust penalty.":
   "Circumstances prevented the booking. No trust penalty.",
  canReviewBooking:false};
 if(input.status!=="PROMISED")return null;
 const preview=input.plannedBooking;
 if(preview&&Number.isSafeInteger(preview.year)&&preview.year>=1&&
  Number.isSafeInteger(preview.week)&&preview.week>=1&&preview.week<=52&&
  preview.kind===(input.decision==="PROMISE_SEGMENT"?"SEGMENT":"MATCH")){
  return {stage:"PLANNED",headline:kind+" on a future card",
   detail:preview.showName+" · Y"+preview.year+" W"+preview.week+
    (preview.status==="SUBMITTED"?" · confirmed":" · draft")+
    ". This only counts after the show is certified"+due+".",
   canReviewBooking:true};
 }
 return {stage:"UNBOOKED",headline:kind+" still to book",
  detail:"No matching future card is recorded yet"+due+countdown+
   ". Only a certified appearance can keep this promise.",
  canReviewBooking:true};
}
