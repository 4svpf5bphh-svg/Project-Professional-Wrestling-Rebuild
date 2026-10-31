/** Match the NEXT on-screen beat to certified programme momentum.
 * Advice only: never auto-book participants, finishes or a finale.
 * Both Programme Desk and the actual card editor use these same choices.
 * No new Neon reads, AI calls, or other persistent state.
 */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
import {SEGMENT_BOOKING_RULES} from "./segment-booking.js";
export interface ProgrammeAngleContext{
 heat:number|null;repetition:number;
 latestFollowUp?:{choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
  laterMatchRecorded?:boolean;laterAngleRecorded?:boolean;
  nextMatchWeekIndex?:number|null;nextAngleWeekIndex?:number|null}|null;
}
export interface ProgrammeAngleIdea{
 kind:SegmentKind;title:string;reason:string;minutes:number;
}
const idea=(kind:SegmentKind,title:string,reason:string,minutes=5):ProgrammeAngleIdea=>{
 if(!SEGMENT_BOOKING_RULES[kind])throw new Error("Unsupported angle recommendation");
 return {kind,title,reason,minutes};
};
export function recommendProgrammeAngles(p:ProgrammeAngleContext):readonly ProgrammeAngleIdea[]{
 const d=p.latestFollowUp;
 if(d?.choice==="PLAN_RETALIATION"&&
    !d.laterAngleRecorded&&d.nextAngleWeekIndex==null){
  return [
   idea("CONFRONTATION","Demand an answer","Someone still owes a response after the last match. Set the face-to-face outcome yourself."),
   idea("ATTACK","Escalate the feud","A deliberate ambush raises the stakes without another straight rematch."),
   idea("INTERVIEW","Explain the grievance","Let the injured party speak before deciding whether the rivalry turns physical.",6)
  ];
 }
 if(d?.choice==="PURSUE_REMATCH"&&
    !d.laterMatchRecorded&&d.nextMatchWeekIndex==null){
  return [
   idea("CHALLENGE","Call for the rematch","Put the requested return bout on the record. A challenge is not a booked match."),
   idea("CONTRACT_SIGNING","Agree the stakes","Have both sides publicly agree to terms before you book the actual match.",7),
   idea("VIDEO_PACKAGE","Recap the issue","Remind viewers why the rematch matters without repeating last week's encounter.",3)
  ];
 }
 if(p.repetition>=55){
  return [
   idea("VIDEO_PACKAGE","Refresh the story","Repeated chapters need a recap or a new perspective before more of the same.",3),
   idea("INTERVIEW","A new point of view","Change the scene from a match to someone's motivation or unanswered grievance.",6),
   idea("CHALLENGE","Raise the stakes","Give the next meeting a clear purpose, rather than repeating an ordinary bout.")
  ];
 }
 if((p.heat??0)>=75){
  return [
   idea("CONTRACT_SIGNING","Build to the big match","Audience interest is high. Establish the terms of a major confrontation.",7),
   idea("CHALLENGE","Make it official","Turn the rivalry's momentum into a clear demand for the next match."),
   idea("VIDEO_PACKAGE","Recap the road here","Use past certified chapters to make the eventual payoff feel earned.",3)
  ];
 }
 if((p.heat??0)<35){
  return [
   idea("INTERVIEW","Give the issue a voice","Show why the wrestlers care before pushing another match.",6),
   idea("CONFRONTATION","Establish the conflict","Put the two sides face to face and choose how they leave the scene."),
   idea("VIDEO_PACKAGE","Introduce the stakes","Help fans recognise the participants and their reason to fight.",3)
  ];
 }
 return [
  idea("CONFRONTATION","Raise the tension","The audience knows the issue. Give the next encounter a meaningful twist."),
  idea("CHALLENGE","Set a destination","A public challenge gives the next meeting something to build toward."),
  idea("INTERVIEW","Explore a motive","Use an interview to explain what each side wants from this feud.",6)
 ];
}
