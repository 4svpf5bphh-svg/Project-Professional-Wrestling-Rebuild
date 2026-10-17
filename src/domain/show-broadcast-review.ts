/** Full deterministic fallback commentary for PPW Ringside.
 * The review is always available even with no AI key, service or network.
 * The editorial tone may vary; every event claim comes from the locked
 * card, resolved receipt, verified medical evidence or title contest ledger.
 */
import type {ShowResultEntry} from "../db/show-results-view.js";
export type BroadcastTone="RED_HOT"|"OVER"|"MIXED"|"FLAT";
export interface BroadcastReview{
 tone:BroadcastTone;reaction:string;recap:string;verdict:string;
 tag:string;headline:string;
 /** Structured paragraphs permit future optional AI prose without changing
  * the read model, headline cards or server-authoritative consequences. */
 paragraphs:readonly string[];
 /** Short confirmed consequences, not imagined play-by-play. */
 bulletins:readonly string[];
}
function pick(options:readonly string[],key:string,salt:number):string{
 let hash=(2166136261^salt)>>>0;
 for(const char of key){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
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
  "That got the place on its feet.","The room came alive for this one."],key,4);
 if(score>=65)return pick(["A healthy reaction from the crowd.",
  "The audience got behind the moment.","The room was with them.",
  "The crowd had plenty to cheer."],key,5);
 if(score>=45)return pick(["A mixed reaction in the building.",
  "Some of the crowd bought in; others stayed quiet.",
  "A respectable but uneven reception."],key,6);
 return pick(["The room went cold.","The fans were hard to win over.",
  "Not much noise from the audience."],key,7);
}
function verdict(tone:BroadcastTone,key:string,isAngle:boolean):string{
 const lines:Record<BroadcastTone,string[]>=isAngle?{
  RED_HOT:["That angle got people talking.","A cracking piece of television.",
   "A highlight for the creative team."],
  OVER:["Good business that moved the show along.",
   "A worthwhile beat in the bigger picture."],
  MIXED:["Not every angle catches fire.","It played out, but the reaction was divided."],
  FLAT:["The segment fell flat.","That beat failed to connect with the room."],
 }:{
  RED_HOT:["They tore the house down.","Now THAT was wrestling.",
   "A match worth putting on the highlight reel.","That is how you leave an impression."],
  OVER:["A solid night at the office.","A good shift between the ropes.",
   "That was proper wrestling business."],
  MIXED:["A match with its moments.","A serviceable contest, nothing more."],
  FLAT:["One to forget.","The bout never found its audience.",
   "Back to the drawing board for this one."],
 };
 return pick(lines[tone],key,8);
}
function intentOpening(intent:string,key:string):string{
 const lines:Record<string,string[]>={
  TECHNICAL:["A technical contest was the brief.",
   "The card called for mat craft rather than spectacle."],
  HIGH_RISK:["High-risk wrestling was the booking.",
   "The creative plan asked the competitors to push the risk dial up."],
  STORY:["The story between the wrestlers was the focus of the booking.",
   "The promotion pitched this one as a chapter in a bigger story."],
  EPIC:["An epic was the ambition, with plenty to live up to.",
   "Big-match drama was what the booker ordered."],
  SHOWCASE:["A chance to put someone in the shop window.",
   "The booking gave the competitors a chance to seize the spotlight."],
  DOMINANT:["The booking was designed to make a statement.",
   "Dominance was the creative brief."],
  PROTECTIVE:["The creative plan put a premium on protecting reputations.",
   "This was booked as a careful balancing act."],
  COMPETITIVE:["Bragging rights were the premise.",
   "A straightforward contest was the booking."],
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
function finishColour(outcome:string,key:string):string{
 const lines:Record<string,string[]>={
  CLEAN_PIN:["The referee counted three to make it official.",
   "A clean pinfall provided the final decision."],
  FLASH_PIN:["A flash pin made all the difference.",
   "The official result came from a sudden flash pin."],
  SUBMISSION:["The bout ended when the submission was recorded.",
   "The tap-out decided the contest."],
  DISQUALIFICATION:["The referee had seen enough and called the disqualification.",
   "The contest was decided by disqualification, not a clean fall."],
  FOREIGN_OBJECT:["A foreign object tainted the result.",
   "The record shows an illicit object helped decide the contest."],
  PROTECTED_FINISH:["Outside involvement left the finish anything but clean.",
   "The official decision came by a protected finish."],
  INJURY_STOPPAGE:["The referee stopped the contest for medical reasons.",
   "An injury brought the contest to a premature end."],
  OVER_THE_TOP_ROPE:["The final over-the-top-rope elimination settled the field.",
   "The battle royal ended with one entrant left standing."],
 };
 return pick(lines[outcome]??["The official finish is on the record."],key,12);
}
function falloutLines(entry:ShowResultEntry):string[]{
 const f=entry.fallout;
 if(!f)return [];
 const lines:string[]=[];
 if(f.interference){
  const actor=f.interference.personName??"The scheduled outside participant";
  if(f.interference.outcome==="SUCCESS")
   lines.push(actor+" carried out the booked run-in. Outside help affected the presentation of the finish.");
  else if(f.interference.outcome==="THWARTED")
   lines.push(actor+"'s attempted run-in was thwarted; the scripted decision remained intact.");
  else lines.push(actor+"'s scheduled interference did not materialise.");
 }
 if(f.eliminations.length)
  lines.push("Recorded elimination order: "+f.eliminations.join(" → ")+".");
 if(f.title){
  const t=f.title;
  if(t.changed)lines.push("NEW CHAMPION: "+t.winnerName+" captured the "+
   t.name+(t.priorHolderName?" from "+t.priorHolderName:"")+".");
  else if(t.priorHolderName===t.winnerName)
   lines.push(t.winnerName+" successfully defended the "+t.name+".");
  else lines.push("The "+t.name+" did not change hands"+
   (t.priorHolderName?"; "+t.priorHolderName+" remained champion":"")+
   ". The official match winner and title holder are not necessarily the same.");
 }
 for(const injury of f.injuries){
  lines.push(injury.personName+" sustained a "+injury.severity.toLowerCase()+
   " injury"+(injury.weeksOut!==null?
    " (recorded absence: "+injury.weeksOut+" PPW "+
    (injury.weeksOut===1?"week":"weeks")+")":"")+
   (injury.stoppage?"; the referee stopped the match":"")+".");
 }
 return lines;
}
export function reviewCompletedEntry(entry:ShowResultEntry,showId:string):BroadcastReview{
 const key=showId+":"+entry.slotId;
 const tone=broadcastTone(entry.crowdResponse);
 const isAngle=entry.type==="SEGMENT";
 const tag=isAngle?(entry.segmentKind??"ANGLE").replaceAll("_"," "):
  formatTitle(entry.matchContext?.format??"SINGLES");
 let headline=entry.headline;
 const reactionText=reaction(entry.crowdResponse,key);
 const opinion=verdict(tone,key,isAngle);
 let paragraphs:string[]=[];
 const bulletins=falloutLines(entry);
 if(isAngle){
  if(entry.outcome==="REFUSED")headline="Didn't go to plan: "+entry.headline;
  else if(entry.outcome==="INTERRUPTED")headline="Cut short: "+entry.headline;
  paragraphs=[entry.summary,reactionText,
   entry.outcome==="REFUSED"?
    "The booked moment was refused. It cannot be treated as a successful angle.":
    entry.outcome==="INTERRUPTED"?
    "The planned moment was interrupted before completion.":
    "The segment went ahead as authored."];
 }else{
  const context=entry.matchContext;
  const billing=context?.sides.map(side=>side.join(" & ")).join(" vs ");
  const opening=intentOpening(context?.intent??"COMPETITIVE",key);
  const stakes=context?.championshipContested?" A championship was on the line.":"";
  const format=context?formatTitle(context.format):"match";
  const minutes=entry.fallout?.actualMinutes;
  const rating=entry.fallout?.ratingStars;
  const execution=entry.fallout?.executionQuality;
  const measured=minutes!==undefined?
   " Official running time: "+minutes+" minutes.":"";
  const critics=rating!==undefined?
   " The official match rating was "+rating.toFixed(2)+" out of 5 stars.":"";
  const delivery=execution!==undefined?
   execution>=85?" The performers delivered exceptional in-ring execution.":
   execution>=70?" The execution was strong enough to carry the contest.":
   execution>=50?" The in-ring execution was uneven.":
   " The contest struggled on execution, regardless of the booking's intentions.":
   "";
  const contrast=rating!==undefined&&rating>=3.75&&entry.crowdResponse<50?
   " Technically well-rated wrestling met a stubborn crowd.":
   rating!==undefined&&rating<2.5&&entry.crowdResponse>=78?
   " The spectators enjoyed it more than the critical rating suggested.":"";
  paragraphs=[
   (billing?billing+" met in a "+format+". ":"The contest took place. ")+opening+stakes+measured,
   finishColour(entry.outcome,key)+" "+entry.summary,
   "The crowd response was "+entry.crowdResponse.toFixed(1)+"/100."+critics+
    delivery+contrast+" "+reactionText+" "+pick(tone==="RED_HOT"?[
    "This was one of the hotter reactions on the card.",
    "The numbers confirm it connected with the audience."]:tone==="FLAT"?[
    "The response reflected a difficult night in front of the crowd.",
    "It was an uphill battle to get the crowd onside."]:[
    "The crowd score tells its own story.",
    "The live response helps put the result in context."],key,14),
  ];
  if(entry.outcome==="INJURY_STOPPAGE")headline="The referee waves it off";
  else if(entry.fallout?.title?.changed)headline="NEW CHAMPION: "+
   entry.fallout.title.winnerName;
  else if(entry.outcome==="FOREIGN_OBJECT")headline="A win with an asterisk";
  else if(entry.outcome==="DISQUALIFICATION")headline="The referee has seen enough";
  else if(entry.outcome==="OVER_THE_TOP_ROPE")headline="Last wrestler standing";
 }
 return {tone,tag,headline,paragraphs,bulletins,
  recap:[...paragraphs,...bulletins].join(" "),reaction:reactionText,verdict:opinion};
}
/** Fully receipt-derived show overview; never a second database fetch. */
export function broadcastShowPulse(entries:readonly ShowResultEntry[]){
 let top:ShowResultEntry|null=null,hot=0,cold=0;
 for(const entry of entries){
  if(!top||entry.crowdResponse>top.crowdResponse)top=entry;
  if(entry.crowdResponse>=80)hot++;
  if(entry.crowdResponse<45)cold++;
 }
 return {topSlotId:top?.slotId??null,hotMoments:hot,coldMoments:cold};
}
