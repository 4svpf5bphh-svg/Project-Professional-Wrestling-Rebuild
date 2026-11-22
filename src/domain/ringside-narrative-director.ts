/** Deterministic one-show editorial direction, not a second simulator.
 * Uses only the completed show's certified projection. No SQL, AI or writes.
 * These are instructions to a journalist, NOT claims that unseen spots aired.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import {wrestlingMatchIQ} from "./wrestling-iq.js";

const concise=(s:string,max=130)=>s.trim().slice(0,max);
const minutes=(e:ShowResultEntry)=>e.fallout?.actualMinutes??
 e.matchContext?.plannedMinutes??null;
const rating=(e:ShowResultEntry)=>e.type==="MATCH"?
 e.fallout?.ratingStars:e.segmentRatingStars;
const formats={
 SINGLES:"Contrast the opponents' verified styles. Only two wrestlers compete.",
 TAG:"Follow one legal wrestler per team, tags and tactical isolation. Do not invent the fall scorer.",
 MULTI_TEAM:"Track legal teammates, disputed openings and one recorded winner; don't guess who scored.",
 MULTI_PERSON:"All rivals can break up falls. No tags, invented allies or elimination.",
 BATTLE_ROYAL:"Survival and rope positioning. No invented elimination order."
} as const;

export interface MatchDirection{
 setup:string;turn:string;decisive:string;verdict:string;
}
/** This supplies a narrative arc without certifying invented moves, near-falls
 * or individual scorers. For long matches, the writer may add temporary
 * colour only inside the recorded format and official outcome.
 */
export function directRingsideMatch(e:ShowResultEntry):MatchDirection|null{
 if(e.type!=="MATCH"||!e.matchContext)return null;
 const iq=wrestlingMatchIQ(e);
 const m=e.matchContext,stars=rating(e),length=minutes(e);
 const winner=concise(m.winnerNames.join(" & ")||"the recorded winning side",110);
 const format=iq?.format??"SINGLES";
 const setup=formats[format]??formats.SINGLES;
 const turn=length!==null&&length<=6?
  "One quick tactical opening, little extended control; no lengthy near-fall sequence.":
  typeof stars==="number"&&stars<2.5?
  "Describe an uneven exchange, without inventing a botch or injury. Keep escalation modest.":
  typeof stars==="number"&&stars>=4.25&&e.crowdResponse>=80&&
   length!==null&&length>=12?
  "Build sustained pressure and a credible counter; ONE earned near-fall may occur before the true finish.":
  length!==null&&length>=18?
  "Show measured control, a credible adjustment and the resulting opening. No invented title or injury.":
  "Show one plausible exchange or tactical counter, then move toward the finish.";
 const finish=e.outcome;
 const pin=" The defeated side's shoulders, NOT the winner's, are counted.";
 const decisive=finish==="CLEAN_PIN"?
  winner+" wins with a separate legal three-count. Any prior hold is released or escaped."+pin:
  finish==="FLASH_PIN"?
  winner+" snatches a sudden cradle or roll-up for three, not an impact finisher."+pin:
  finish==="SUBMISSION"?
  winner+" wins by the recorded submission: tap or referee stoppage, no pinfall.":
  finish==="FOREIGN_OBJECT"?
  winner+" wins by concealed illegal use of "+
   (m.finishProp?concise(String(m.finishProp).toLowerCase().replaceAll("_"," ")):
    "the recorded object")+
   (m.refereeSpot==="REF_BUMP"?" while the referee is down, before the official can count.":
    " without the referee detecting the foul.")+
   " Do not award a new title without a recorded title change.":
  finish==="DISQUALIFICATION"?
  winner+" is awarded a disqualification. No pinfall or tap-out decides it.":
  finish==="PROTECTED_FINISH"?
  winner+" prevails via the disputed official decision; invent no weapon, run-in or definite clean fall.":
  finish==="INJURY_STOPPAGE"?
  winner+" is awarded the stoppage; no pin or extra medical consequences.":
  finish==="RETRIEVAL"?
  winner+" retrieves the suspended prize; no decisive three-count.":
  finish==="TABLE_BREAK"?
  winner+" wins by breaking the table with an opponent; no deciding pin.":
  finish==="TEN_COUNT"?
  winner+" is the last standing as the opponent fails the referee's ten-count.":
  finish==="MOST_FALLS"?
  winner+" leads when the Iron Man clock expires; never invent a fall score.":
  finish==="SECOND_FALL"?
  winner+" earns the decisive second fall; do not fabricate earlier falls.":
  finish==="VERBAL_SURRENDER"?
  winner+" prevails when the opponent verbally says I quit; no tap or pin.":
  finish==="FIRST_BLOOD"?
  winner+" wins when the opponent bleeds first; no pin or medical diagnosis.":
  finish==="CASKET_CLOSE"?
  winner+" wins when the casket lid closes on the opponent; no three-count.":
  "Use ONLY the certified result and winning side.";
 const verdict=typeof stars!=="number"?
  "Use the documented audience response; do not claim an instant classic.":
  stars<2.5?"A disappointing or awkward bout; identify a credible weakness, without a fake botch.":
  stars<3.5?"Solid but imperfect wrestling; appreciate effective moments without extravagant hype.":
  stars<4.25?"A strong match with earned praise for specific execution; no automatic classic.":
  stars<4.75?"An excellent performance; give the decisive exchange proper space.":
  "An exceptional contest; vivid detail and a rare big-match sense of occasion are justified.";
 return {setup,turn,decisive,verdict};
}
export interface AngleDirection{
 focus:string;screen:string;
}
/** Match-style descriptions cannot carry a debut or a spoken character moment.
 * The authored sequence is supplied separately as facts: this is ONLY
 * editorial emphasis and scene boundary guidance.
 */
export function directRingsideAngle(e:ShowResultEntry):AngleDirection|null{
 if(e.type!=="SEGMENT")return null;
 const kind=e.segmentKind??"";
 const actions=e.segmentContext?.scriptedActions??[];
 const spoken=actions.some(a=>a.action==="SPEAK"||a.action==="CHALLENGE");
 const violent=actions.some(a=>["ATTACK","FIGHT_BACK","RESCUE","BETRAY"].includes(a.action));
 const kindFocus=kind==="DEBUT"?
  "Treat this as a genuine first appearance: arrival, booked reveal and authentic words, not a generic card item.":
  kind==="PROMO"||kind==="CHALLENGE"?
  "Use the exact scripted statement to convey motive and voice; do not explain storyline mechanics.":
  kind==="INTERVIEW"?
  "Lead with the speaker's actual words or stance and what the interview reveals; not a generic scene summary.":
  kind==="VIDEO_PACKAGE"?
  "Frame the advertised stakes and contrasts; report no unverified footage, meeting, outcome or flashback.":
  kind==="TURN"?
  "Show the recorded change of character and any certified actions; no invented friendship or betrayal.":
  kind==="CONTRACT_SIGNING"?
  "Report who appeared, what they actually agreed to or refused, and only the filmed actions.":
  ["ATTACK","POST_MATCH_ASSAULT","RESCUE"].includes(kind)?
  "Show the recorded physical sequence and its on-camera reaction, not imaginary injuries or retaliation.":
  "Make this a distinctive filmed beat using the recorded participants, scene and outcome.";
 const grade=rating(e);
 const impact=typeof grade==="number"&&grade>=3.75&&e.crowdResponse>=75?
  "This was a major segment; give it detail and space.":
  e.crowdResponse<45?"The audience was subdued; don't claim a huge reaction.":
  "Keep its emphasis proportional to the response.";
 const presence=e.segmentContext?.targetPresence==="MENTIONED"?
  " Named targets are only mentioned, not present or replying.":
  e.segmentContext?.targetPresence==="ON_SCREEN"?
  " On-screen targets may be described, but only their recorded actions.":"";
 const screen=(violent?"Follow ONLY the certified physical sequence.":
  spoken?"Speech is not permission for a fight. Preserve any exact authored lines.":
  "No extra physical or spoken action beyond the verified scene.")+presence;
 return {focus:kindFocus+" "+impact,screen};
}
function salience(e:ShowResultEntry):number{
 const stars=rating(e);
 const quality=typeof stars==="number"?stars*15:e.crowdResponse*.35;
 const crowd=e.crowdResponse*.55;
 const title=e.type==="MATCH"&&e.matchContext?.championshipContested?12:0;
 const changed=e.fallout?.title?.changed?25:0;
 const moment=e.type==="MATCH"&&e.outcome==="FOREIGN_OBJECT"?8:
  e.type==="SEGMENT"&&e.segmentKind==="DEBUT"?12:
  e.type==="SEGMENT"&&e.segmentKind==="TURN"?12:0;
 const main=e.matchContext?.isMainEvent?4:0;
 return quality+crowd+title+changed+moment+main;
}
/** Deterministic, stable top-three editorial hierarchy. Never overwrites
 * slot ordering, and never claims a spotlight is a new simulated event.
 */
export function directRingsideShow(show:CompletedShowView){
 const ranked=show.entries.map((e,i)=>({i,score:salience(e)}))
  .sort((a,b)=>b.score-a.score||a.i-b.i);
 const top=ranked.slice(0,3);
 return {lead:"card_"+(top[0]?.i??0),support:top.slice(1).map(x=>"card_"+x.i)};
}
