/** Match the NEXT on-screen beat to certified programme momentum.
 * Advice only: never auto-book participants, finishes or a finale.
 * Both Programme Desk and the actual card editor use these same choices.
 * No new Neon reads, AI calls, or other persistent state.
 */
import type {SegmentKind} from "../simulation/legacy/show-segments.js";
import type {StoryFollowUp} from "./programme-story-follow-up.js";
import type {AngleScene} from "./angle-scene.js";
import {SEGMENT_BOOKING_RULES} from "./segment-booking.js";
export interface ProgrammeAngleContext{
 programmeFormat?:"RIVALRY"|"SOLO"|"RELATIONSHIP"|"FACTION";
 heat:number|null;repetition:number;activityCount?:number;segmentCount?:number;
 programmeId?:string;championshipId?:string|null;
 recentActivity?:readonly {kind:string;showId?:string;slotId?:string}[];
 lastChapter?:{kind:string;segmentKind:string|null;
  sceneLocation?:string|null;scenePurpose?:string|null}|null;
 creativeIntent?:{followUp?:StoryFollowUp}|null;
 latestFollowUp?:{choice:"PURSUE_REMATCH"|"PLAN_RETALIATION"|"LET_STAND";
  laterMatchRecorded?:boolean;laterAngleRecorded?:boolean;
  nextMatchWeekIndex?:number|null;nextAngleWeekIndex?:number|null}|null;
}
export interface ProgrammeAngleIdea{
 kind:SegmentKind;title:string;reason:string;minutes:number;
 purpose:AngleScene["purpose"];location:AngleScene["location"];
}
const idea=(kind:SegmentKind,title:string,reason:string,minutes=5):ProgrammeAngleIdea=>{
 if(!SEGMENT_BOOKING_RULES[kind])throw new Error("Unsupported angle recommendation");
 // Actual screenplay defaults instead of a generic first dropdown choice.
 // These are editable direction suggestions, never a scripted result.
 const map:Record<SegmentKind,{purpose:AngleScene["purpose"];location:AngleScene["location"]}>={
  PROMO:{purpose:"REVEAL_MOTIVATION",location:"IN_RING"},
  INTERVIEW:{purpose:"REVEAL_MOTIVATION",location:"INTERVIEW_AREA"},
  CONFRONTATION:{purpose:"BUILD_RIVALRY",location:"IN_RING"},
  CHALLENGE:{purpose:"SET_UP_MATCH",location:"IN_RING"},
  CELEBRATION:{purpose:"CELEBRATE_SUCCESS",location:"IN_RING"},
  ATTACK:{purpose:"SEEK_REVENGE",location:"BACKSTAGE"},
  INTERRUPTION:{purpose:"STEAL_SPOTLIGHT",location:"IN_RING"},
  RESCUE:{purpose:"PROTECT_ALLY",location:"IN_RING"},
  POST_MATCH_ASSAULT:{purpose:"BUILD_RIVALRY",location:"IN_RING"},
  TURN:{purpose:"EXPLAIN_TURN",location:"IN_RING"},
  CONTRACT_SIGNING:{purpose:"SET_UP_MATCH",location:"IN_RING"},
  INTERFERENCE:{purpose:"COST_RIVAL_VICTORY",location:"RINGSIDE"},
  DEBUT:{purpose:"INTRODUCE_WRESTLER",location:"ENTRANCE_RAMP"},
  VIDEO_PACKAGE:{purpose:"RECAP_RIVALRY",location:"VIDEO_SCREEN"},
  STABLE_INVITATION:{purpose:"RECRUIT_ALLY",location:"BACKSTAGE"},
  STABLE_EXIT:{purpose:"EXPLAIN_SPLIT",location:"BACKSTAGE"},
  STABLE_RECONCILIATION:{purpose:"REPAIR_ALLIANCE",location:"BACKSTAGE"}
 };
 return {kind,title,reason,minutes,...map[kind]};
};
/** A character journey, an alliance or a faction has no fictional enemy side.
 * Recommend scenes one can book from the actual cast and editable facts.
 * No turn, feud, victory, stable membership or relationship is presumed.
 */
function nonRivalProgrammeAngles(p:ProgrammeAngleContext):readonly ProgrammeAngleIdea[]{
 // Explicit manager response to an actual certified scene has priority.
 const saved=p.creativeIntent?.followUp;
 const latest=p.recentActivity?.[0];
 // A new certified chapter supersedes the older manager response.
 // The old choice remains visible in history, but cannot keep hijacking
 // the next-booking suggestions after the World has genuinely moved on.
 const choice=saved&&(!latest||!latest.showId||!latest.slotId||
  (latest.showId===saved.sourceShowId&&latest.slotId===saved.sourceSlotId))?
  saved.choice:null;
 if(choice==="CHANGE_PRESENTATION"){
  const subject=p.programmeFormat==="SOLO"?"the character":
   p.programmeFormat==="RELATIONSHIP"?"the relationship":"the faction";
  return [
   idea("VIDEO_PACKAGE","Reframe the story",
    "Introduce a different view of "+subject+" using certified scenes, without rewriting the past.",3),
   idea("INTERVIEW","Hear a new perspective",
    "Choose a real cast member to explain their motive. No loyalty change or turn is assumed.",6),
   idea("PROMO","State a new direction",
    "The booker writes what the character wants; no outcome or future match is decided.")];
 }
 if(choice==="SLOW_BURN")return [
  idea("VIDEO_PACKAGE","Let the moment sink in",
   "Recap what actually aired. Holding back escalation cannot create a new event.",3),
  idea("INTERVIEW","Plant a quieter question",
   "Let the selected character hint at the next chapter, not claim it already happened.",6),
  idea("PROMO","Tease a long-term goal",
   "Name an ambition without promising a turn, alliance, title or result.")];
 if(choice==="BUILD_ON_REACTION"){
  const subject=p.programmeFormat==="SOLO"?"the wrestler":
   p.programmeFormat==="RELATIONSHIP"?"these characters":"the group's real cast";
  return [
   idea("PROMO","Give the reaction a purpose",
    "Let "+subject+" set a fresh goal following the verified scene; no win or deal is granted."),
   idea("INTERVIEW","Respond to the audience",
    "Use genuine cast and certified events; change the beat rather than repeating a scene.",6),
   idea("VIDEO_PACKAGE","Show what connected",
    "Recap the performed chapter. The next outcome remains the booker's choice.",3)];
 }
 const started=(p.activityCount??0)>0;
 if(p.programmeFormat==="SOLO")return started?[
  idea("INTERVIEW","React to their latest chapter",
   "Let the wrestler reflect on their real on-screen journey, regardless of how the last match ended.",6),
  idea("PROMO","Set a new personal goal",
   "Choose a clear next ambition; a declaration is not a guaranteed title opportunity.",5),
  idea("VIDEO_PACKAGE","Show their journey",
   "Revisit actual certified performances without inventing extra wins or setbacks.",3)
 ]:[
  idea("INTERVIEW","Introduce their ambition",
   "Give the wrestler a motive before asking fans to invest in their rise.",6),
  idea("PROMO","Make a personal statement",
   "Let the wrestler explain their character and goals; you decide how it is received."),
  idea("VIDEO_PACKAGE","Introduce the wrestler",
   "Present the character and their authentic background without inventing a result.",3)
 ];
 if(p.programmeFormat==="RELATIONSHIP")return started?[
  idea("INTERVIEW","Explore the bond",
   "Use a real conversation to explore trust or doubt, without assuming a betrayal.",6),
  idea("CELEBRATION","Share a moment",
   "Script a public scene between the characters if it suits what has actually happened."),
  idea("VIDEO_PACKAGE","Revisit their history",
   "Remind viewers of certified moments rather than claiming off-screen friendship.",3)
 ]:[
  idea("INTERVIEW","Introduce the connection",
   "Let these wrestlers explain why they might work together; no alliance is granted."),
  idea("PROMO","Set a shared goal",
   "Put the possible partnership's ambition in the ring before any success is assumed."),
  idea("CELEBRATION","Share the spotlight",
   "Choose how the characters interact in a real scene; no unearned victory is implied.")
 ];
 // Faction programmes can involve unaffiliated people. Do not insert actual
 // stable transactions, leader roles, automatic splits or backstage promises.
 return started?[
  idea("INTERVIEW","Who holds the group together?",
   "Give each character a chance to express ambition or doubt based on real events.",6),
  idea("PROMO","Declare the group's direction",
   "Decide who speaks for the group and what they demand, without assigning a leader."),
  idea("VIDEO_PACKAGE","The faction's road so far",
   "Use certified chapters to show how this group has evolved.",3)
 ]:[
  idea("PROMO","Present the group",
   "Let the chosen wrestlers explain a common purpose; this is not a new stable transaction."),
  idea("INTERVIEW","What does each person want?",
   "Explore individual motives before a leader, alliance or betrayal is established.",6),
  idea("CELEBRATION","Share the stage",
   "Choose how these characters interact publicly; no shared achievement is assumed.")
 ];
}
function rawProgrammeAngles(p:ProgrammeAngleContext):readonly ProgrammeAngleIdea[]{
 const d=p.latestFollowUp;
 if(d?.choice==="PLAN_RETALIATION"&&
    !d.laterAngleRecorded&&d.nextAngleWeekIndex==null){
  const hot=p.repetition>=30||(p.segmentCount??0)>=3;
  return hot?[
   idea("ATTACK","Strike back","The previous response is overdue. A booked ambush can change the stakes without another rematch."),
   idea("INTERVIEW","Air the grievance","Make the retaliation personal before anyone throws a punch.",6),
   idea("CONFRONTATION","Demand an answer","Put both sides face to face and script who stands tall.")
  ]:[
   idea("CONFRONTATION","Demand an answer","A direct response is due. Choose how the confrontation ends."),
   idea("ATTACK","Escalate the feud","A deliberate ambush raises the stakes without another rematch."),
   idea("INTERVIEW","Explain the grievance","Let the injured party explain what comes next.",6)
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
 if(d?.choice==="PURSUE_REMATCH"&&
    (d.laterMatchRecorded||d.nextMatchWeekIndex!=null)){
  // The return bout really happened. Stop asking for the same rematch and
  // suggest a fresh response to the certified chapter instead.
  return [
   idea("INTERVIEW","React to the return bout","The requested rematch happened. Let its aftermath shape the next chapter.",6),
   idea("VIDEO_PACKAGE","Show what changed","Revisit the completed rematch before deciding whether the rivalry needs another meeting.",3),
   idea("CONFRONTATION","A fresh reason to clash","If these rivals face off again, give them a new point of conflict and a different ending.")
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
 const choices=[
  idea("CHALLENGE","Set a destination","Give the next match a clear objective instead of another generic confrontation."),
  idea("INTERVIEW","Explore a motive","Let someone explain why this fight matters now.",6),
  idea("CONFRONTATION","Raise the tension","A face-to-face can change the direction if it ends differently from before.")
 ];
 const lastKind=p.recentActivity?.[0]?.kind;
 const offset=((p.activityCount??0)+(p.segmentCount??0)+
  (lastKind==="SEGMENT"?1:0))%choices.length;
 return [...choices.slice(offset),...choices.slice(0,offset)];
}

/** When the most recent certified chapter used the same type, change the
 * lead suggestion. A rematch/retaliation promise still uses its own choices.
 */
export function recommendProgrammeAngles(p:ProgrammeAngleContext):readonly ProgrammeAngleIdea[]{
 const ideas=p.programmeFormat&&p.programmeFormat!=="RIVALRY"?
  nonRivalProgrammeAngles(p):rawProgrammeAngles(p);
 const previous=p.lastChapter;
 if(previous?.kind!=="SEGMENT"||!previous.segmentKind||ideas.length<2||
  ideas[0]?.kind!==previous.segmentKind)return ideas;
 // Preserve all three alternatives, never merely vary a headline.
 return [...ideas.slice(1),ideas[0]!];
}
