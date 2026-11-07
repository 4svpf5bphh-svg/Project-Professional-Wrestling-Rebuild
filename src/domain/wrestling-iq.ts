/** Wrestling grammar for non-durable editorial colour. Certified match receipts
 * remain the only source of winners, finishers, actual injuries and title changes.
 * No AI requests, SQL reads or invented in-ring event records are produced here.
 */
import type {ShowResultEntry} from "../db/show-results-view.js";

export type WrestlingFormat="SINGLES"|"TAG"|"MULTI_TEAM"|"MULTI_PERSON"|"BATTLE_ROYAL";
export interface WrestlingMatchIQ {
 format:WrestlingFormat;
 competitors:number;
 legalAction:string;
 finishDiscipline:string;
 psychology:string;
 pace:string;
 possibleSpots:string;
 /** Possibilities for a journalist, never certified moves or story events. */
 storySpine:readonly [string,string,string];
}
const clean=(s:string)=>s.split(" · ").at(-1)??s;
export function wrestlingMatchIQ(entry:ShowResultEntry):WrestlingMatchIQ|null {
 const m=entry.matchContext;
 if(entry.type!=="MATCH"||!m||m.sides.length<2)return null;
 const size=m.sides[0]?.length??0;
 const total=m.sides.reduce((sum,side)=>sum+side.length,0);
 const group=m.sides.length===2&&size===1?"SINGLES":
  size>1&&m.sides.every(side=>side.length===size)?
   m.sides.length===2?"TAG":"MULTI_TEAM":
  clean(m.format)==="BATTLE_ROYAL"||m.format.startsWith("BATTLE_ROYAL")?"BATTLE_ROYAL":"MULTI_PERSON";
 const format:WrestlingFormat=group;
 const minutes=entry.fallout?.actualMinutes??m.plannedMinutes;
 const pace=minutes!==null&&minutes!==undefined&&minutes<7?
  "Brief contest: start quickly and keep the struggle and finish concise; do not write an epic.":
  minutes!==null&&minutes!==undefined&&minutes>=20?
  "Long contest: controlled build, adjustments, selling, plausible escalation and a carefully timed closing stretch.":
  "Moderate contest: exchanges, distinct turning point and an efficient closing stretch.";
 const quality=entry.fallout?.ratingStars;
 const psychology=quality!==undefined&&quality<2?
  "The bout did not click: awkward timing, flat stretches or unconvincing offence can colour the critique; never fabricate a botch or injury.":
  quality!==undefined&&quality>=4?
  "Strong execution deserves specific praise for pacing, selling and hard-earned counters; not endless finishers.":
  "Let the audience response, contrasting wrestler styles and character choices determine whether the match feels tight, scrappy or underwhelming.";
 const finish=entry.outcome==="FLASH_PIN"?
  "One opportunistic cradle or roll-up decides the match; no impact finisher is proved.":
  entry.outcome==="CLEAN_PIN"?
  "Only an appropriate legal cover and referee three-count decides the official win.":
  entry.outcome==="SUBMISSION"?
  "Official surrender by tap-out or referee stoppage; no decisive three-count.":
  entry.outcome==="DISQUALIFICATION"?
  "A referee's disqualification ends the contest; not a clean pin or submission.":
  entry.outcome==="INJURY_STOPPAGE"?
  "An actual verified referee/medical stoppage ends it; do not also invent a normal fall.":
  "Use ONLY the recorded winning method; do not assign a decisive move, fall or individual scorer not certified in the result.";
 const singlesLegal="Conventional singles: only the two opponents compete, with pinfall covers counted to three, voluntary submission or referee stoppage, rope breaks and referee oversight. Ring-out and DQ can matter only when consistent with the stipulated rules and recorded finish. No tags or tag partners.";
 const tagLegal="Conventional two-sided tag bout: ONE legal wrestler per team competes at a time. Their partner(s) wait at the apron/corner, and a legal tag changes who may wrestle and score/suffer a fall. Brief legal double-team exchanges may follow a tag. Illegal partner interference can draw a referee warning, but invent no DQ or official interference. Never present both partners as continuously legal, or a partner on the apron scoring the fall. The recorded winning side is NOT proof of which teammate scored the pin.";
 const multiTeamLegal="Multi-team tag contest: team members must tag to change their own legal competitor; never put every teammate legally in the ring at once. Some promotions differ on how opposing teams enter, so do not assert unrecorded rotation, an elimination or which individual scored the fall. Keep the recorded winning team authoritative.";
 const multiPersonLegal="Multi-person singles contest: all listed individuals may wrestle without tags. Others may interrupt covers or submissions; no imaginary team partnerships. Do not invent DQ/count-out when prohibited by this match's rules.";
 const battleLegal="Battle royal: individuals fight simultaneously; elimination requires going over the top rope to the floor under the game's booked elimination rules. Do not turn an elimination into a pin/submission, or invent a final elimination order.";
 const legalAction=format==="SINGLES"?singlesLegal:format==="TAG"?tagLegal:
  format==="MULTI_TEAM"?multiTeamLegal:format==="BATTLE_ROYAL"?battleLegal:multiPersonLegal;
 const possibleSpots=format==="SINGLES"?
  "Lock-up, chain wrestling, body-part focus, rope escape, counters, selling, a credible near-fall and a finishing stretch. Pick selectively for these characters.":
  format==="TAG"||format==="MULTI_TEAM"?
  "Corner control, cutting the ring in half, a struggling partner reaching for the corner, legal tags, occasional double-team and an earned hot tag IF the match calls for it. A squash need not include a hot tag.":
  format==="BATTLE_ROYAL"?
  "Survival near ropes, an attempted throw, opportunistic alliances and shifting crowd focus, but never invent a specific elimination.":
  "Broken covers, temporary alliances of convenience, rapid momentum changes and ring positioning. No tags.";
 const storySpine:[string,string,string]=format==="TAG"||format==="MULTI_TEAM"?
  ["Establish legal competitors and team dynamics without inventing the starting lineup.",
   "If earned, build through isolation, a tag attempt or a tactical change; do not force a hot tag.",
   "Finish with the legal competitor's credited side and the single certified decision; never invent the individual scorer."]:
  format==="BATTLE_ROYAL"?
  ["Establish the ring's crowded survival stakes.",
   "Show credible pressure near ropes without declaring any unrecorded elimination.",
   "Reach the recorded victory and preserve any certified elimination order."]:
  format==="MULTI_PERSON"?
  ["Introduce competing styles and the danger of an unguarded third/fourth rival.",
   "Use disrupted covers and changing tactical opportunities without inventing a betrayal.",
   "One decisive certified finish establishes the winner; don't imply a tag."]:
  ["Introduce both wrestlers' styles and their reasons to wrestle.",
   "Select a plausible exchange, counter or selling sequence that fits the contest length.",
   "Land the one authoritative finish and a measured judgement of the crowd response."];
 return {format,competitors:total,legalAction,finishDiscipline:finish,
  psychology,pace,possibleSpots,storySpine};
}

/** Catch only high-confidence impossible legal claims; avoid rejecting colourful
 * language merely because a tag or rope reference appears in casual prose.
 */
export function validateWrestlingMechanics(entry:ShowResultEntry,prose:string):void{
 const iq=wrestlingMatchIQ(entry);
 if(!iq)return;
 if(iq.format==="SINGLES"||iq.format==="MULTI_PERSON"||iq.format==="BATTLE_ROYAL"){
  if(/\b(?:hot tag|tagged (?:his|her|their) partner in|made (?:the|a) tag to (?:his|her|their) partner|tagged into (?:the|this) match)\b/i.test(prose))
   throw new Error("Ringside invented tag-team mechanics in an individual match");
 }
 if(iq.format==="TAG"||iq.format==="MULTI_TEAM"){
  if(/\b(?:both (?:team )?partners? (?:were|remained|became) legal|every (?:team )?member (?:was|became) legal|all (?:four|six|eight|ten) (?:wrestlers|competitors) (?:were|became) legal|no (?:tags|tagging) (?:were|was) (?:needed|required)|pinned (?:his|her|their) opponent from (?:the )?apron)\b/i.test(prose))
   throw new Error("Ringside described impossible tag-team legality");
 }
}
