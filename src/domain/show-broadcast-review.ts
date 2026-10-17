/** Lightweight, deterministic on-device wrestling broadcast copy.
 * Every claim is based on a completed receipt, locked booking or scored crowd
 * response. Character moves never become fictional match move-by-move logs.
 */
import type {ShowResultEntry} from "../db/show-results-view.js";
export type BroadcastTone="RED_HOT"|"OVER"|"MIXED"|"FLAT";
export interface BroadcastReview {
 tone:BroadcastTone;reaction:string;recap:string;verdict:string;
 tag:string;headline:string;
}
function pick(options:readonly string[],key:string,salt:number):string{
 let hash=(2166136261^salt)>>>0;
 for(let i=0;i<key.length;i++){
  hash^=key.charCodeAt(i);hash=Math.imul(hash,16777619);
 }
 return options[(hash>>>0)%options.length]!;
}
export function broadcastTone(score:number):BroadcastTone{
 if(score>=80)return "RED_HOT";
 if(score>=65)return "OVER";
 if(score>=45)return "MIXED";
 return "FLAT";
}
function reaction(score:number,key:string):string{
 if(score>=80)return pick(["The building was buzzing.","The crowd was all in.",
  "That got the place on its feet."],key,4);
 if(score>=65)return pick(["A healthy reaction from the crowd.",
  "The audience got behind the moment.","The room was with them."],key,5);
 if(score>=45)return pick(["A mixed reaction in the building.",
  "Some of the crowd bought in; others stayed quiet.",
  "A respectable but uneven reception."],key,6);
 return pick(["The room went cold.","The fans were hard to win over.",
  "Not much noise from the audience."],key,7);
}
function verdict(tone:BroadcastTone,key:string,isAngle:boolean):string{
 const m:Record<BroadcastTone,string[]>=isAngle?{
  RED_HOT:["That angle got people talking.","A cracking piece of television.",
   "The crowd gave that moment its flowers."],
  OVER:["Good business that moved the show along.",
   "A worthwhile beat in the bigger picture."],
  MIXED:["Not every angle catches fire.","It played out, but the reaction was divided."],
  FLAT:["The segment fell flat.","That beat failed to connect with the room."],
 }:{
  RED_HOT:["They tore the house down.","Now THAT was wrestling.",
   "A match worth putting on the highlight reel."],
  OVER:["A solid night at the office.","A good shift between the ropes.",
   "That was proper wrestling business."],
  MIXED:["A match with its moments.","A serviceable contest, nothing more."],
  FLAT:["One to forget.","The bout never found its audience.",
   "Back to the drawing board for this one."],
 };
 return pick(m[tone],key,8);
}
function intentOpening(intent:string,key:string):string{
 const lines:Record<string,string[]>={
  TECHNICAL:["The booking put mat craft front and centre.",
   "A technical contest was the plan."],
  HIGH_RISK:["The competitors were booked to push the risk dial up.",
   "High-risk wrestling was the brief."],
  STORY:["The feud and the personalities drove the booking.",
   "This was booked as a chapter in a bigger story."],
  EPIC:["An epic was the ambition. A lot to live up to.",
   "The booking aimed for big-match drama."],
  SHOWCASE:["A chance to put someone in the shop window.",
   "The spotlight was the point of this booking."],
  DOMINANT:["The booking was designed to make a statement.",
   "Dominance was the creative brief."],
  PROTECTIVE:["The creative brief aimed to protect reputations.",
   "A carefully balanced result was on the card."],
  COMPETITIVE:["A straight contest was the order of the night.",
   "Bragging rights were the premise."],
 };
 return pick(lines[intent]??lines.COMPETITIVE!,key,10);
}
function formatTitle(format:string):string{
 if(format==="BATTLE ROYAL")return "Battle royal";
 if(format==="SINGLES")return "Singles match";
 if(format.endsWith("-WAY"))return format.replace("-WAY","-way match").toLowerCase();
 if(format.includes("team"))return format.toLowerCase()+" match";
 return format.toLowerCase()+" tag match";
}
export function reviewCompletedEntry(entry:ShowResultEntry,showId:string):BroadcastReview{
 const key=showId+":"+entry.slotId;
 const tone=broadcastTone(entry.crowdResponse);
 const isAngle=entry.type==="SEGMENT";
 const tag=isAngle?(entry.segmentKind??"ANGLE").replaceAll("_"," "):
  formatTitle(entry.matchContext?.format??"SINGLES");
 let recap="";
 let headline=entry.headline;
 if(isAngle){
  if(entry.outcome==="REFUSED")headline="Didn't go to plan: "+entry.headline;
  else if(entry.outcome==="INTERRUPTED")headline="Cut short: "+entry.headline;
  // The canonical story describes the performed, refused or interrupted action.
  recap=entry.summary;
 }else{
  const context=entry.matchContext;
  const billing=context?.sides.map(side=>side.join(" & ")).join(" vs ");
  const opening=intentOpening(context?.intent??"COMPETITIVE",key);
  const stakes=context?.championshipContested?" A championship was on the line.":"";
  // A title match does not imply a belt actually changed hands.
  recap=(billing?billing+". ":"")+opening+stakes+" "+entry.summary;
  if(entry.outcome==="INJURY_STOPPAGE")headline="The referee waves it off";
  else if(entry.outcome==="FOREIGN_OBJECT")headline="A win with an asterisk";
  else if(entry.outcome==="DISQUALIFICATION")headline="The referee has seen enough";
  else if(entry.outcome==="OVER_THE_TOP_ROPE")headline="Last wrestler standing";
 }
 return {tone,tag,headline,recap:recap.trim(),reaction:reaction(entry.crowdResponse,key),
  verdict:verdict(tone,key,isAngle)};
}
/** No extra API fetches: show-wide editorial breakdown from the same receipt. */
export function broadcastShowPulse(entries:readonly ShowResultEntry[]){
 let top:ShowResultEntry|null=null,hot=0,cold=0;
 for(const entry of entries){
  if(!top||entry.crowdResponse>top.crowdResponse)top=entry;
  if(entry.crowdResponse>=80)hot++;
  if(entry.crowdResponse<45)cold++;
 }
 return {topSlotId:top?.slotId??null,hotMoments:hot,coldMoments:cold};
}
