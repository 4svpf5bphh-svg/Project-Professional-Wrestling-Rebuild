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

/** Factual colour for the original 14 authored angle categories. There is no
 * move log, spoken dialogue, automatic contract signing or simulated consent.
 * Never use HAPPENS-only material for a refused or interrupted booking. */
export function confirmedAngleColour(entry:ShowResultEntry,showId:string):string|null{
 if(entry.type!=="SEGMENT"||entry.outcome!=="HAPPENS")return null;
 const kind=entry.segmentKind??"";
 const ctx=entry.segmentContext;
 const who=ctx?.actorNames.join(" & ")||"The featured talent";
 const whom=ctx?.targetNames.join(" & ")||"their intended opposition";
 const key=showId+":"+entry.slotId;
 switch(kind){
  case "PROMO":return pick([
   who+" held the microphone. The spoken words were not preserved in the result.",
   "The microphone belonged to "+who+". The recorded crowd reaction tells us how the appearance landed.",
  ],key,51);
  case "INTERVIEW":return pick([
   who+" faced the interview spotlight. No invented quotes are needed to read the crowd's reaction.",
   "The booked interview put "+who+" on screen, with the outcome preserved but no fabricated dialogue.",
  ],key,52);
  case "CONFRONTATION":return who+" came face-to-face with "+whom+
   ". The record confirms the confrontation, not an unbooked brawl.";
  case "CHALLENGE":return who+" issued a challenge to "+whom+
   ". A challenge is not proof that the opposition accepted.";
  case "CELEBRATION":return who+" took the celebration spot. "+
   "The recorded audience response measures how it was received.";
  case "ATTACK":{
   const place=ctx?.scene?.location?{
    IN_RING:"in the ring",ENTRANCE_RAMP:"on the ramp",BACKSTAGE:"backstage",
    LOCKER_ROOM:"in the locker room",PARKING_LOT:"in the car park",OFFICE:"in the office"
   }[ctx.scene.location]:"at the scene";
   const aftermath=ctx?.scene?.visual==="BLOODIED"?
    " The target was left bloodied on screen; this is not a medical injury.":
    ctx?.scene?.visual==="LEFT_LYING"?" The target was left laid out.":"";
   return who+" attacked "+whom+" "+place+"."+aftermath;
  }
  case "TURN":return who+" completed the authored change of allegiance"+
   (ctx?.turnTargetAlignment?" toward a "+ctx.turnTargetAlignment.toLowerCase()+" presentation":"")+
   ". The player's scripted turn stands; the simulation did not choose a different outcome.";
  case "CONTRACT_SIGNING":return "The signing scene involving "+who+
   " was performed on the card. A television angle does not itself execute a wrestler contract.";
  case "INTERFERENCE":return who+" carried out the scripted interference against "+
   whom+". This angle cannot silently rewrite a recorded match winner.";
  case "DEBUT":return who+" made the scheduled live debut. This was an actual "+
   "authored appearance, not merely a video teaser.";
  case "VIDEO_PACKAGE":{
   const subjects:Record<string,string>={
    DEBUT_HYPE:"an upcoming debut",RETURN_HYPE:"a return",
    WRESTLER_HYPE:"the featured wrestler",FEUD_RECAP:"an ongoing feud",
    EVENT_PROMO:"the event"};
   const topic=ctx?.videoPurpose?subjects[ctx.videoPurpose]:undefined;
   return "The video package spotlighted "+(topic??who)+
    ". A promotional video is not proof that the advertised event already occurred.";
  }
  case "STABLE_INVITATION":return ctx?.stableDecision==="ACCEPTED"?
   whom+" accepted the faction invitation on camera. A story beat is "+
    "not by itself a transfer of real membership.":
   ctx?.stableDecision==="REJECTED"?
    whom+" rejected the faction's approach. The booker's decision is the one on record.":
    who+" invited "+whom+" to the faction. No acceptance was recorded.";
  case "STABLE_EXIT":return who+" played out the faction departure. "+
   "The scene cannot silently edit the World roster.";
  case "STABLE_RECONCILIATION":return ctx?.stableDecision==="ACCEPTED"?
   "The attempted reconciliation between "+who+" and "+whom+" was accepted on screen.":
   ctx?.stableDecision==="REJECTED"?
    whom+" rebuffed the overture from "+who+". The authored rejection remains decisive.":
    who+" tried to reconcile with "+whom+". No acceptance was recorded.";
  default:return null;
 }
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
  const performed=confirmedAngleColour(entry,showId);
  paragraphs=[entry.summary,
   entry.outcome==="REFUSED"?
    "The planned moment was refused; the advertised action did not take place.":
    entry.outcome==="INTERRUPTED"?
    "The planned moment was interrupted before completion; the full booked action was not performed.":
    performed??"The segment went ahead as authored.",
   reactionText+" "+opinion];
 }else{
  const context=entry.matchContext;
  const billing=context?.sides.map(side=>side.join(" & ")).join(" vs ");
  const opening=intentOpening(context?.intent??"COMPETITIVE",key);
  const stakes=context?.championshipContested?" A championship was on the line.":"";
  const format=context?formatTitle(context.format):"match";
  const minutes=entry.fallout?.actualMinutes;
  const rating=entry.fallout?.ratingStars;
  const execution=entry.fallout?.executionQuality;
  const chemistry=entry.fallout?.chemistryModifier;
  const measured=minutes!==undefined?
   " Official running time: "+minutes+" minutes.":"";
  const critics=rating!==undefined?
   " The official match rating was "+rating.toFixed(2)+" out of 5 stars.":"";
  const delivery=execution!==undefined?
   execution>=85?" The wrestlers barely put a foot wrong between the bells.":
   execution>=70?" The wrestling held together when it mattered.":
   execution>=50?" There were good ideas here, even if the timing sometimes wobbled.":
   " There were too many rough edges between the bells.":
   "";
  const chemistryRead=chemistry!==undefined&&chemistry>=1.5?
   " Their in-ring chemistry made the exchanges feel natural.":
   chemistry!==undefined&&chemistry<=-1.5?
   " Their timing worked against them when they needed it most.":
   "";
  const chapter=entry.programmeChapters?.[0];
  const rivalry=chapter?(()=>{
   const history=chapter.precedingMatches;
   const prior=chapter.previousWinner==="A"?chapter.sideA:
    chapter.previousWinner==="B"?chapter.sideB:null;
   const who=chapter.sideA+" and "+chapter.sideB;
   if(history>0)return who+" had already shared "+history+
    (history===1?" match":" matches")+" in the previous twelve weeks."+
    (prior?" "+prior+" had won their most recent meeting.":"")+
    (chapter.precedingAngles?" There had been "+chapter.precedingAngles+
     (chapter.precedingAngles===1?" on-screen chapter":" on-screen chapters")+
     " along the way.":"");
   if(chapter.precedingAngles>0)return who+" had "+chapter.precedingAngles+
    (chapter.precedingAngles===1?" on-screen chapter":" on-screen chapters")+
    " behind them before this encounter.";
   return who+" had no earlier recorded rivalry meeting in the last twelve weeks.";
  })():entry.fallout?.linkedProgrammes?(
   "This contest was part of an ongoing rivalry. "+
   (entry.fallout.programmeSignal==="PROGRAMME_REPETITION"?
    "Repeated meetings had started to test the audience's patience.":
    entry.fallout.programmeSignal==="HOT_PROGRAMME"?
    "The story gave the crowd something to care about.":
    entry.fallout.programmeSignal==="COOL_PROGRAMME"?
    "The issue still needed to win the crowd over.":
    "The next chapter belongs to the wrestlers and their booker.")
  ):null;
  const contrast=rating!==undefined&&rating>=3.75&&entry.crowdResponse<50?
   " Technically well-rated wrestling met a stubborn crowd.":
   rating!==undefined&&rating<2.5&&entry.crowdResponse>=78?
   " The spectators enjoyed it more than the critical rating suggested.":"";
  paragraphs=[
   (billing?billing+" met in a "+format+". ":"The contest took place. ")+opening+stakes+measured,
   ...(rivalry?[rivalry]:[]),
   finishColour(entry.outcome,key)+" "+entry.summary,
   reactionText+critics+delivery+chemistryRead+contrast+" "+
    pick(tone==="RED_HOT"?[
    "One of the night's loudest moments.",
    "The audience had plenty to talk about afterwards."]:tone==="FLAT"?[
    "They never quite got the room onside.",
    "The audience wanted more than it got."]:[
    "There was plenty to pick apart once the bell rang.",
    "The debate will outlast the final bell."],key,14),
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
