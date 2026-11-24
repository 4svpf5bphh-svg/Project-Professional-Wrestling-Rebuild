import {finishPropLabel} from "./bookable-match.js";
/** A full-card editorial projection. It never writes simulation facts. */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import type {RingsideMemory} from "../db/ringside-continuity.js";
import {verifiedSlotStoryThreads,ringsideViewerCallback} from "./ringside-story-threads.js";
import {directRingsideMatch,directRingsideAngle,directRingsideShow} from "./ringside-narrative-director.js";
import {wrestlingMatchIQ,validateWrestlingMechanics} from "./wrestling-iq.js";
import {ringsideProseQualityFailure,impossibleHoldCount,reportedTapInPinfall,unseenCleanCount} from "./ringside-prose-quality.js";
import {MATCH_STIPULATIONS,type MatchStipulation} from "./match-stipulations.js";
// New writing guidance is independently versioned. Previously published
// reports stay immutable; an old completed show never needs a fresh API call.
export const RINGSIDE_PROMPT_VERSION="ringside-v14";
export const RINGSIDE_PREVIOUS_VERSION="ringside-v13";
export const RINGSIDE_OLDER_VERSION="ringside-v12";
export const RINGSIDE_LEGACY_VERSION="ringside-v4";
export const RINGSIDE_MODEL="openai/gpt-oss-120b";
/** Compact, provider-neutral vocabulary. No additional model request, database
 * read or invented permanent event; the recorded winning method stays final. */
const STIPULATION_NOTES:Partial<Readonly<Record<MatchStipulation,{
 win:string;texture:string;storyBeats?:string}>>>={
 HARDCORE:{win:"Pinned or submitted under no-disqualification rules.",
  texture:"An uncompromising fight that may spill outside and use ringside objects, but invent no decisive weapon or medical fallout."},
 STEEL_CAGE:{win:"Pinfall or submission inside the cage; escape is NOT a winning method.",
  texture:"Steel mesh looming over the ring, bodies pressed against the wall, rattling panels and restricted space. No invented outsiders.",
  storyBeats:"Make the enclosure change the wrestling: cramped movement, a plausible brush or impact against the steel, then a weary closing stretch ending in the certified legal finish inside the cage. Do not claim escaping won."},
 LADDER:{win:"Climb a ladder and retrieve the suspended prize; a pin cannot win.",
  texture:"Ladders erected and toppled, interrupted climbs, precarious reaches. Do not invent serious falls or injuries."},
 TABLES:{win:"Send the opponent through a table; no three-count.",
  texture:"Tables being positioned, avoided and threatened, with one decisive break."},
 TLC:{win:"Retrieve the suspended prize from a ladder; a pin or table break alone cannot win.",
  texture:"A hazardous landscape of tables, ladders and chairs, the ladder climb carrying the final stakes."},
 LAST_MAN_STANDING:{win:"A wrestler loses by failing to stand before the referee completes ten.",
  texture:"Repeated knockdowns and the referee's audible rising count; no made-up hospital aftermath."},
 SUBMISSION:{win:"Tap-out or referee stoppage from a submission hold; no pinfall.",
  texture:"Grip changes, limb pressure, crawling to ropes and struggles to escape a hold."},
 IRON_MAN:{win:"Most certified falls when the time limit expires; don't invent an exact score.",
  texture:"The clock, stamina, tactical adjustments and exhaustion across successive falls.",
  storyBeats:"Tell the clock-pressure story: pacing early, the physical cost of multiple falls, and urgency as time runs down; the clock expires with the recorded winner ahead, without invented scores."},
 TWO_OUT_OF_THREE:{win:"The second winning fall decides the bout; no fabricated earlier fall-by-fall score.",
  texture:"Wrestlers adjust tactics through the contest as the final fall becomes urgent."},
 FALLS_COUNT_ANYWHERE:{win:"Pin or submission can count beyond the ring; no count-out.",
  texture:"Ringside floor, ramp and arena boundaries can become part of the action."},
 I_QUIT:{win:"The opponent must VERBALLY surrender to the referee, normally into a microphone; a tap-out, pin or referee stoppage cannot win.",
  texture:"Escalating pressure and psychology, threats of another painful hold, a microphone held close while the opponent refuses before finally speaking. No automatic blood, weapons or injury.",
  storyBeats:"Write a physical escalation, not a generic technical match: a defiant refusal to give in, another plausible cruel use of pressure or the ring environment, then the referee offering the microphone as tension peaks. ONLY the losing wrestler finally says I quit. No invented weapon, blood or lasting injury."},
 FIRST_BLOOD:{win:"First opponent made to bleed loses; no three-count or submission win.",
  texture:"The apprehension of a cut ending the match; don't turn blood into a diagnosed or lasting injury."},
 BACKSTAGE_BRAWL:{win:"Recorded pin or submission decides a fight in a backstage area.",
  texture:"Corridors, loading bays and production equipment provide setting, not automatic collateral damage."},
 CASKET:{win:"Place the opponent inside the casket and shut the lid; no pinfall.",
  texture:"Struggles near the casket, attempts to keep the lid open and the decisive closure, without supernatural embellishment."}
};
export function ringsideStipulationNote(format:string){
 const stip=MATCH_STIPULATIONS.find(s=>s.value!=="STANDARD"&&
  format.startsWith(s.label+" · "));
 const note=stip?STIPULATION_NOTES[stip.value]:null;
 return stip&&note?{stipulation:stip.value,winningCondition:note.win,
  plausibleAction:note.texture,
  ...(note.storyBeats?{dramaticBeats:note.storyBeats}:{})}:null;
}
/** The cage permits pin and submission, but only the certified finish wins.
 * Bind its closing narrative to the actual result rather than letting Groq
 * invent a simultaneous tap-out/three-count (seen in real playtests).
 * This is prompt shaping from an existing result; it costs zero SQL/AI calls.
 */
function verifiedStipulationNote(format:string,finish:string){
 const note=ringsideStipulationNote(format);
 if(!note||note.stipulation!=="STEEL_CAGE"||!note.dramaticBeats)return note;
 const method=/(?:^|_)PIN(?:$|_)/.test(finish)?"certified pin":
  finish==="SUBMISSION"?"certified submission":null;
 return method?{...note,dramaticBeats:note.dramaticBeats.replace(
  "certified legal finish",method)+
  (method==="certified pin"?
   " No tap-out or surrender counts as the finish.":
   " No three-count or cage escape counts as the finish.")}:note;
}

export interface RingsideCopy{
 showHeadline:string;opening:string;closing:string;
 slots:{slotId:string;headline:string;recap:string}[];
}
export function ringsideFacts(show:CompletedShowView){
 return {
  showId:show.showId,showName:show.showName??"Weekly show",year:show.year,
  week:show.week,bookingClass:show.bookingClass??"REGULAR",
  crowdScore:show.crowdResponse,
  slots:show.entries.map(e=>({
   slotId:e.slotId,position:e.position,type:e.type,
   outcome:e.outcome,crowdScore:e.crowdResponse,
   officialHeadline:e.headline,officialSummary:e.summary,
   match:e.matchContext??null,angle:e.segmentContext??null,
   segmentKind:e.segmentKind??null,intent:e.intent??null,
   fallout:e.fallout??null,
   wrestlers:(e.performerIdentities??[]).map(p=>({
    name:p.ringName,persona:p.character,style:p.style,
    signatures:p.signatureMoves,finishers:p.finishingMoves
   }))
  }))
 };
}
const printable=(v:unknown,max:number)=>typeof v==="string"&&v.length>0&&
 v.length<=max&&!/[<>\x00-\x08]/.test(v);
const shape=(x:unknown)=>x&&typeof x==="object"&&!Array.isArray(x)?
 x as Record<string,unknown>:null;
/** A cache hit must be type-safe without expanding the show or reading more rows. */
export function validateCachedRingsideCopy(candidate:unknown):RingsideCopy{
 const v=shape(candidate);
 if(!v||Object.keys(v).some(k=>!["showHeadline","opening","closing","slots"].includes(k))||
  !printable(v.showHeadline,140)||!printable(v.opening,900)||
  !printable(v.closing,650)||!Array.isArray(v.slots)||
  v.slots.length===0||v.slots.length>30)throw new Error("Invalid Ringside cache");
 const seen=new Set<string>();
 const slots=v.slots.map((raw:unknown)=>{
  const s=shape(raw);
  if(!s||Object.keys(s).some(k=>!["slotId","headline","recap"].includes(k))||
   !printable(s.slotId,200)||!printable(s.headline,150)||!printable(s.recap,1800)||
   seen.has(s.slotId as string))throw new Error("Invalid cached Ringside slot");
  seen.add(s.slotId as string);
  return {slotId:s.slotId as string,headline:s.headline as string,recap:s.recap as string};
 });
 return {showHeadline:v.showHeadline as string,opening:v.opening as string,
  closing:v.closing as string,slots};
}
/** Treat spaces, hyphens (including non-breaking broadcast hyphens), and
 * punctuation consistently; keep word boundaries so short move names cannot
 * match inside an unrelated word. */
const moveSurface=(value:string)=>value.normalize("NFKC").toLowerCase()
 .replace(/[^\p{L}\p{N}]+/gu," ").trim().replace(/\s+/g," ");

/** A referenced wrestler is not automatically an on-camera participant.
 * Never turn a solo promo's named target into an unscripted entrance, reply,
 * move, or physical reaction. Names are escaped as literal words. */
const literalPattern=(value:string)=>[...value].map(ch=>
 "\\^$.*+?()[]{}|".includes(ch)?"\\"+ch:ch).join("");
function assertReferencedPromoTargetStayedOffScreen(
 source:ShowResultEntry,prose:string):void{
 if(source.type!=="SEGMENT"||
  !["PROMO","INTERVIEW","CHALLENGE","CONTRACT_SIGNING","VIDEO_PACKAGE"].includes(
   source.segmentKind??"")||!source.segmentContext||
  source.segmentContext.targetPresence==="ON_SCREEN")return;
 const actors=new Set(source.segmentContext.actorNames.map(x=>x.toLocaleLowerCase()));
 for(const name of source.segmentContext.targetNames){
  if(actors.has(name.toLocaleLowerCase())||!name.trim())continue;
  const target=literalPattern(name);
  // A named target isn't in the scene. CWA v12's "Joe faced Riddle"
  // and "Riddle's calm stare" passed the old entrance/response check.
  const last=name.trim().split(/\s+/).at(-1)??"";
  const uniqueLast=last.length>=5&&
   [...source.segmentContext.targetNames,...source.segmentContext.actorNames]
    .filter(n=>n.trim().split(/\s+/).at(-1)?.toLowerCase()===last.toLowerCase())
    .length===1;
  for(const alias of uniqueLast?[name,last]:[name]){
   const quoted=literalPattern(alias);
   const facing=new RegExp(
    "\\b(?:faced|faces|facing|stared (?:directly |straight )?at|"+
    "stared down|staring at|fixed|fixing|looked at|looking at|"+
    "locked eyes with|stood opposite|sat opposite|seated opposite|"+
    "stood across from|sat across from|leaned toward|leaned towards)\\s+"+
    quoted+"\\b","iu");
   const bodyLanguage=new RegExp(
    "(?:^|[^\\p{L}\\p{N}])"+quoted+"['’]s\\s+"+
    "(?:(?:calm|silent|defiant|cold|angry|knowing|sharp|steady|nervous|"+
    "furious|icy|trademark|quiet|stoic|stunned)\\s+){0,2}"+
    "(?:stare|glare|expression|reaction|smile|grimace|nod|body language|"+
    "eyes|gaze|face|fists|hands)\\b","iu");
   const impliedReaction=new RegExp(
    "(?:^|[^\\p{L}\\p{N}])"+quoted+"\\s*,?\\s+whose\\s+"+
    "(?:(?:calm|silent|defiant|cold|angry|knowing|sharp|steady|nervous|"+
    "furious|icy|quiet|stoic|stunned)\\s+){0,2}"+
    "(?:stare|glare|expression|reaction|smile|grimace|gaze|eyes|face)\\b","iu");
   if(facing.test(prose)||bodyLanguage.test(prose)||impliedReaction.test(prose))
    throw new Error("Ringside invented an off-screen promo target appearance");
  }
  const body=new RegExp(
   "(?:^|[^\\p{L}\\p{N}])"+target+
   "(?:\\s+|['’]s\\s+)"+
   "(?:answered|replied|responded|interrupted|stepped|walked|ran|"+
   "charged|stood|approached|entered|arrived|appeared|emerged|came\\s+(?:down|out|to)|performed|"+
   "executed|landed|hit|launched|gestured|watched|stared|smirked|"+
   "loomed|grabbed|raised|lifted|attacked|struck|climbed)\\b","iu");
  const physical=new RegExp(
   "(?:^|[^\\p{L}\\p{N}])"+target+"['’]s\\s+"+
   "(?:mask|eyes|face|hands|fists|boots)\\s+"+
   "(?:glint(?:ed|ing)|gleam(?:ed|ing)|flash(?:ed|ing)|"+
   "shin(?:e|ing)|shone|sparkled|appeared|loomed)\\b","iu");
  if(body.test(prose)||physical.test(prose))
   throw new Error("Ringside invented an off-screen promo target appearance");
 }
}


/** Do not let Groq turn a speech-only booked chapter into a surprise brawl.
 * Explicit scripted beats are authoritative; stage business is optional colour,
 * not permission to add unbooked wrestling moves or lasting consequences. */
function assertSpokenAngleStayedSpoken(source:ShowResultEntry,prose:string):void{
 const actions=source.segmentContext?.scriptedActions;
 if(source.type!=="SEGMENT"||!actions?.length||
  actions.some(a=>["ATTACK","FIGHT_BACK","RESCUE","BETRAY"].includes(a.action)))return;
 let body=prose;
 // Exact booker-written lines may quote a threat of violence, not enact it.
 for(const a of actions)if(a.line)body=body.replaceAll(a.line,"");
 if(/\b(?:series|flurry|exchange|barrage|succession|combination) of[^.!?]{0,55}\b(?:drop[ -]?kicks?|superkicks?|punches|strikes|suplexes|clotheslines|slams)\b|\b(?:hit|landed|delivered|launched|performed|executed|unleashed|connected with|drilled|levelled|stunned|flattened)[^.!?]{0,65}\b(?:drop[ -]?kicks?|superkicks?|suplexes|clotheslines|powerbombs?|DDTs?|chair shots?|punches|body slams?)\b/i.test(body))
  throw new Error("Ringside invented physical wrestling in a talk-only booked angle");
}

/** Remove only identical repeated sentences locally, no second Groq call.
 * No judgement of paraphrases or simulated finish reconstruction.
 */
export function removeVerbatimRecapEchoes(recap:string):string{
 const paragraphs=recap.split(/\n\s*\n/);
 const seen=new Set<string>();
 return paragraphs.map(p=>{
  const sentences=p.split(/(?<=[.!?])\s+/);
  return sentences.filter(sentence=>{
   const key=moveSurface(sentence);
   if(key.length<24)return true;
   if(seen.has(key))return false;
   seen.add(key);return true;
  }).join(" ");
 }).filter(p=>p.trim()).join("\n\n");
}

/** Dialogue is an on-air fact, not a licence for a journalist to write
 * wrestler speeches. Only manager-authored quotations are permissible.
 */
function assertNoUnscriptedDialogue(entry:ShowResultEntry,prose:string):void{
 if(entry.type!=="SEGMENT")return;
 const quoted=/[“"]([^”"]{28,210})[”"]/gu;
 const authorised=(entry.summary+" "+JSON.stringify(
  entry.segmentContext?.scriptedActions??[])).normalize("NFKC").toLowerCase()
  .replace(/\s+/g," ");
 for(const occurrence of prose.matchAll(quoted)){
  const quote=occurrence[1]?.trim()??"";
  const preceding=prose.slice(Math.max(0,(occurrence.index??0)-100),
   occurrence.index??0);
  const isSpeech=/\b(?:said|shouted|yelled|declared|announced|promised|snarled|demanded|told|replied|warned|delivered the line|claimed)\b/i.test(preceding)||
   /\b(?:i|we|you|my|your|our|me|us)\b/i.test(quote);
  if(!isSpeech)continue;
  const known=quote.normalize("NFKC").toLowerCase().replace(/\s+/g," ");
  if(!authorised.includes(known))
   throw new Error("Ringside invented a direct quotation that was never scripted");
 }
}
/** Attribute a named signature/finisher to its actual performer.
 * The receiving wrestler may still kick out of it; that's the drama.
 * Do not confuse a kick-out with executing somebody else's finisher.
 */
function assertMoveExecutionOwnership(entry:ShowResultEntry,prose:string):void{
 if(entry.type!=="MATCH")return;
 const cast=entry.performerIdentities??[];
 const words=moveSurface(prose);
 const moves=new Map<string,Set<string>>();
 for(const wrestler of cast)for(const move of
  [...wrestler.signatureMoves,...wrestler.finishingMoves]){
  const key=moveSurface(move);
  if(key.length<7)continue;
  const owners=moves.get(key)??new Set<string>();
  owners.add(wrestler.personId);moves.set(key,owners);
 }
 for(const [move,owners] of moves){
  if(!words.includes(move))continue;
  for(const wrestler of cast){
   if(owners.has(wrestler.personId))continue;
   const full=moveSurface(wrestler.ringName);
   const aliases=[full];
   const last=full.split(" ").at(-1)??"";
   if(last.length>=4&&cast.filter(p=>
    moveSurface(p.ringName).endsWith(" "+last)).length===1)
    aliases.push(last);
   for(const actor of new Set(aliases)){
    // Explicit use by a non-owner; does not match "MJF kicked out of...".
    const pattern=new RegExp("(?:^|\\s)"+literalPattern(actor)+
     "\\s+(?:hit|hits|landed|lands|delivered|delivers|executed|executes|used|uses|unleashed|unleashes)"+
     "(?:\\s+[^\\s]+){0,12}\\s+"+literalPattern(move)+"(?:\\s|$)","u");
    if(pattern.test(words))
     throw new Error("Ringside attributed a named finishing move to the wrong wrestler");
   }
  }
 }
}


/** Reject editorial bookends that invent counts of completed finishes. */
function assertCertifiedShowCounts(show:CompletedShowView,headline:string,opening:string,
 closing:string):void{
 const text=[headline,opening,closing].join(" ");
 const numbers:Record<string,number>={one:1,two:2,both:2,three:3,four:4,five:5,
  six:6,seven:7,eight:8,nine:9};
 const claims=/\b(one|two|both|three|four|five|six|seven|eight|nine|[1-9]|a pair of)\s+(?:[\p{L}’'-]+\s+){0,3}(submissions?|tap[- ]?outs?|pinfalls?|title changes?)\b/giu;
 const total=(kind:string)=>kind.startsWith("submis")||kind.startsWith("tap")?
  show.entries.filter(e=>e.type==="MATCH"&&e.outcome==="SUBMISSION").length:
  kind.startsWith("pin")?
   show.entries.filter(e=>e.type==="MATCH"&&
    ["CLEAN_PIN","FLASH_PIN"].includes(e.outcome)).length:
   show.entries.filter(e=>e.type==="MATCH"&&e.fallout?.title?.changed===true).length;
 for(const claim of text.matchAll(claims)){
  const n=claim[1]!.toLowerCase()==="a pair of"?2:numbers[claim[1]!.toLowerCase()]??
   Number(claim[1]);
  if(Number.isFinite(n)&&n!==total(claim[2]!.toLowerCase()))
   throw new Error("Ringside invented a show-level finish count");
 }
}

/** The World knows the winning side of a triple/four-way, not the person pinned. */
function assertUnrecordedMultiPersonVictim(entry:ShowResultEntry,prose:string):void{
 const sides=entry.matchContext?.sides??[];
 if(entry.type!=="MATCH"||sides.length<3||
  !["CLEAN_PIN","FLASH_PIN","FOREIGN_OBJECT"].includes(entry.outcome))return;
 const winners=new Set(entry.matchContext?.winnerNames??[]);
 for(const name of sides.flat().filter(n=>!winners.has(n))){
  const loser=literalPattern(name);
  const finishBeforeName=new RegExp(
   "\\b(?:cradle|roll[- ]?up|roll(?:ed|ing)?\\s+up|pin(?:ned|ning)?|cover(?:ed|ing)?|stack(?:ed|ing)?\\s+up)\\b[^.!?]{0,85}\\b"+
   loser+"\\b","iu");
  const nameBeforeFinish=new RegExp(
   "\\b"+loser+"\\b[^.!?]{0,65}\\b(?:was (?:pinned|covered|rolled up|caught in a cradle)|took the (?:pin|fall|three[- ]count))\\b","iu");
  if(finishBeforeName.test(prose)||nameBeforeFinish.test(prose))
   throw new Error("Ringside named an unrecorded multi-person fall victim");
 }
}

export class RingsideSlotValidationError extends Error{
 constructor(public readonly slotIndex:number,message:string){super(message);}
}
export function validateRingsideCopy(candidate:unknown,show:CompletedShowView,
 options:{styleWarningOnly?:boolean}={}):RingsideCopy{
 const v=shape(candidate);
 if(!v||Object.keys(v).some(k=>!["showHeadline","opening","closing","slots"].includes(k))||
  !printable(v.showHeadline,140)||!printable(v.opening,900)||
  !printable(v.closing,650)||!Array.isArray(v.slots)||
  v.slots.length!==show.entries.length)throw new Error("Untrusted ringside review shape");
 const slots=v.slots.map((raw:unknown,i:number)=>{
  const s=shape(raw),canonical=show.entries[i];
  if(!s||Object.keys(s).some(k=>!["slotId","headline","recap"].includes(k))||
   s.slotId!==canonical.slotId||!printable(s.headline,150)||
   !printable(s.recap,1800)||!String(s.headline).trim()||!String(s.recap).trim())
   throw new RingsideSlotValidationError(i,"Ringside review changed card order or slot facts");
  return {slotId:s.slotId as string,headline:s.headline as string,recap:s.recap as string};
 });
 // Show-specific move names may appear only in a slot whose current roster
 // projection actually contains the wrestler who owns that repertoire.
 const allMoves=new Map<string,Set<string>>();
 for(const e of show.entries)for(const p of e.performerIdentities??[]){
  for(const move of [...p.signatureMoves,...p.finishingMoves])
   if(move.length>5&&move.length<90){
    const key=moveSurface(move);if(!key)continue;
    const owners=allMoves.get(key)??new Set();
    owners.add(p.personId);allMoves.set(key,owners);
   }
 }
 for(const [i,s] of slots.entries()){
  const e=show.entries[i]!,ids=new Set((e.performerIdentities??[]).map(x=>x.personId));
  const recap=" "+moveSurface(s.headline+" "+s.recap)+" ";
  for(const [move,owners] of allMoves){
   if(recap.includes(" "+move+" ")&&![...owners].some(id=>ids.has(id)))
    throw new RingsideSlotValidationError(i,"Ringside used an unowned signature move");
  }
 }
 // Reject unpublished editorial echoes without modifying canonical match facts.
 const usedSentences=new Set<string>();
 const openers=new Map<string,number>();
 for(const [i,slot] of slots.entries()){
  for(const sentence of slot.recap.split(/(?<=[.!?])\s+|\n+/)){
   const normalized=moveSurface(sentence);
   if(normalized.length>=65){
    if(usedSentences.has(normalized))
     throw new RingsideSlotValidationError(i,"Ringside repeated a full sentence across card entries");
    usedSentences.add(normalized);
   }
  }
  const opener=moveSurface(slot.recap).split(" ").slice(0,7).join(" ");
  if(opener.split(" ").length===7){
   const count=(openers.get(opener)??0)+1;
   if(count>=3)throw new RingsideSlotValidationError(i,"Ringside repeated a stock opening across card entries");
   openers.set(opener,count);
  }
 }
 const fullStory=[v.showHeadline,v.opening,v.closing,...slots.flatMap(x=>[x.headline,x.recap])].join(" ");
 assertCertifiedShowCounts(show,v.showHeadline as string,v.opening as string,v.closing as string);
 // Headline and bookends must not expose directing keys either.
 if(/\b(?:card[_\s-]*\d+|slot[_\s-]*\d+|showfocus|editoriallens|storythread|director\.[a-z]+|week\s+\d{1,3})\b/i.test(fullStory))
  throw new Error("Ringside exposed private card or story metadata");
 const voiceFailure=ringsideProseQualityFailure({
  opening:v.opening as string,closing:v.closing as string,slots});
 if(voiceFailure&&!options.styleWarningOnly)throw new Error(voiceFailure);
 if(/\b(?:protected finish|foreign object|booking intent|scored compatibility|execution quality|crowd score|crowd meter|cheer meter|reaction score|booking grade|chemistry modifier|execution modifier|recorded finish|official record|simulation result|protected victory|official-approved distraction|certified finish|certified decision|booked winner|booked result)\b/i.test(fullStory))
  throw new Error("Ringside leaked technical simulation terminology");
 // Programme history informs the correspondent; it is NOT a list of
 // editor/database events to narrate to the paying audience.
 const internal=/\b(?:rivalry thread|story thread|only recorded rivalry|recorded rivalry|prior angles?|previous angles?|additional angles?|official fallout|match card changed|reported change to the match card|card segment\s+\d+|programme chapters?|scripted actions?|week\s+\d{1,3}\b)\b|\b(?:three|four|five|third|fourth|fifth|\d+)\s+angles?\b/i;
 for(const [i,slot] of slots.entries())if(internal.test(slot.headline+" "+slot.recap))
  throw new RingsideSlotValidationError(i,"Ringside exposed internal storyline or card metadata");
 if(/\b\d{1,3}\s*\/\s*100\b|\b\d{2,3}\.\d+\b|\b\d{1,3}\s*%\s*(?:crowd|cheers|reaction)\b|\b[0-5](?:\.\d{1,2})?[\s\-\u2010-\u2015]*stars?\b/i.test(fullStory))
  throw new Error("Ringside leaked numerical score into editorial");
 for(const [i,slot] of slots.entries()){
  try{
  const source=show.entries[i]!;
  const prose=slot.headline+" "+slot.recap;
  const hadTitleChange=source.fallout?.title?.changed===true;
  const hadInjury=(source.fallout?.injuries.length??0)>0;
  const hadInterference=source.fallout?.interference!==undefined;
  // A model-authored spot is flavour, not authority to create permanent
  // consequences. Confirmed fallout appears separately in the official UI.
  const goldClaims=source.type==="MATCH"&&
   [...prose.matchAll(/\b(?:captur(?:e|ed|es|ing)|claim(?:ed|s|ing)|win(?:s|ning)?|won|secur(?:e|ed|es|ing))\s+(?:(?:the|a|an|his|her|their|vacant|world|tag|women's|intercontinental|universal|heavyweight|singles)\s+){0,4}(?:title|championship|gold|belt)\b(?!\s+(?:shot|opportunity|match|contract|chance))/gi)]
    .some(hit=>{
     const before=prose.slice(Math.max(0,(hit.index??0)-35),hit.index);
     return !/(?:\b(?:did|could|would|will|does|do)\s+not|\b(?:never|didn't|couldn't|wouldn't|failed\s+to|unable\s+to))\s*$/i.test(before);
    });
  if(!hadTitleChange&&(/\b(?:new (?:world |tag |women's )?champion|captured the (?:world |tag |women's )?title|title (?:changed hands|switch(?:ed|es) hands)|(?:won|claimed) the championship)\b/i.test(prose)||goldClaims))
   throw new Error("Invented championship change");
  if(source.type==="MATCH"&&!hadTitleChange&&
   /\b(?:award(?:ed|ing)|gav(?:e)|giv(?:en|ing))\b[^.!?]{0,75}\b(?:the\s+)?(?:win\s+and\s+)?(?:the\s+)?(?:title|championship)\b(?!\s+(?:shot|match|chance|opportunity))/i.test(prose))
   throw new Error("Invented championship change");
  if(source.type==="MATCH"&&!hadTitleChange&&
   [...prose.matchAll(/\b(?:wins?|won|captur(?:e|ed|es)|claim(?:s|ed)?)\b[^.!?]{0,65}\b(?:title|championship)\b(?!\s+(?:match|shot|chance|opportunity|defence|defense))/gi)]
   .some(hit=>{
    const before=prose.slice(Math.max(0,(hit.index??0)-50),hit.index);
    return !/\b(?:did|does|do|could|would|will|has|had)\s+not\s*$|\b(?:never|didn't|couldn't|wouldn't|failed\s+to)\s*$/i.test(before)&&
     !/\b(?:retain(?:s|ed|ing)?|keep(?:s|ing)?|defend(?:s|ed|ing)?)\b[^.!?]{0,20}\b(?:title|championship)\b/i.test(hit[0]);
   }))
   throw new Error("Invented championship change");
  if(source.type==="MATCH"&&
   /\b(?:illegal|illicit|contraband)\s+(?:[a-z-]+\s+){0,2}championship belt\b/i.test(prose))
   throw new Error("Ringside described the legitimate championship belt as illegal instead of its use");
  if(source.type==="MATCH"&&typeof source.fallout?.ratingStars==="number"&&
   source.fallout.ratingStars<3.75&&
   /\b(?:masterpiece|instant classic|match of the year|all[- ]time classic)\b/i.test(prose))
   throw new Error("Ringside exaggerated an ordinary match into an all-time classic");

  // A physical trademark injury/defect must come from the certified
  // character or medical record, not a writer's improvised description.
  if(/\b(?:signature|trademark|famous)\s+(?:[\p{L}-]+\s+){0,3}(?:limp|scar|tattoo|injury)\b|\beyes?\s+(?:shining|sparkling)\b/iu.test(prose))
   throw new Error("Ringside invented unsupported physical traits");
  if(source.type==="SEGMENT"&&source.segmentKind==="VIDEO_PACKAGE"&&
   /\b(?:montage|highlights?|clips?|footage|replay(?:s|ed)?)\b[^.!?]{0,135}\b(?:near[- ]falls?|suplex(?:es)?|finisher|technical exchanges?|pinfall|victor(?:y|ies)|past (?:match|bout))\b/iu.test(prose))
   throw new Error("Ringside invented specific historic video footage");
  if(source.type==="SEGMENT"&&source.segmentKind==="VIDEO_PACKAGE"&&
   /\b(?:last[- ]night['’]?s?|yesterday['’]?s?)\s+(?:victory|win|match|bout)\b|\b(?:did(?:\s+not|n['’]t)|does(?:\s+not|n['’]t))\s+(?:introduce|feature|add|show)\s+(?:new\s+)?(?:moves?|promos?|matches?|spots?)\b|\bno\s+new\s+(?:moves?|promos?|matches?)\b/i.test(prose))
   throw new Error("Ringside invented historical footage or narrated internal video limitations");
  assertNoUnscriptedDialogue(source,prose);
  assertMoveExecutionOwnership(source,prose);
  assertReferencedPromoTargetStayedOffScreen(source,prose);
  assertSpokenAngleStayedSpoken(source,prose);
  // A declared turn against a rival is not proof the two were partners.
  // A saved betrayal direction is necessary for on-air ally history.
  if(source.type==="SEGMENT"&&source.segmentKind==="TURN"&&
   !["BETRAY_PARTNER","ATTACK_ALLY","REFUSE_HELP"].includes(
    source.segmentContext?.turnPresentation??"")&&
   /\b(?:long[- ]?time|former|once[- ]trusted|old)\s+(?:tag[- ]team\s+)?(?:partner|ally|friend|stablemate)\b|\b(?:partnership|friendship|tag[- ]team|alliance(?:['’]s)?|stablemate)\b[^.!?]{0,45}\b(?:split|broken|ripped|betray(?:al|ed)|banner)\b/i.test(prose))
   throw new Error("Ringside invented a partnership or alliance for a turn");
  if(!hadInjury&&/\b(?:suffered (?:a |an )?(?:serious |career-ending )?injury|was stretchered out|taken to hospital|injured (?:his|her|their) (?:knee|shoulder|neck|arm|leg)|left (?:the show|the arena) injured)\b/i.test(prose))
   throw new Error("Invented medical fallout");
  if(!hadInterference&&/\b(?:outside interference|run-in (?:decided|cost|secured)|(?:manager|referee) (?:interfered|attacked)|(?:third party|outsider) interfered)\b/i.test(prose))
   throw new Error("Invented interference");
  if(source.type==="MATCH"){
   assertUnrecordedMultiPersonVictim(source,prose);
   if(source.outcome==="SUBMISSION"&&
    /\b(?:count(?:ed|ing)?\s+(?:of\s+)?taps?|(?:two|three|four|\d+)\s+taps?|taps?\s+(?:were|was)\s+counted)\b/iu.test(prose))
    throw new Error("Ringside invented a referee count of taps");
   if(source.outcome==="FOREIGN_OBJECT"){
    if(/\b(?:match|bout|win|victory)\s+(?:was\s+)?(?:called|awarded|granted)\b[^.!?]{0,90}\b(?:favou?r|victory|win)\b[^.!?]{0,65}\b(?:due to|because of|for)\s+(?:the\s+)?(?:illegal|weapon|belt|foul)/iu.test(prose)||
      /\breferee\b[^.!?]{0,80}\b(?:witnessed|saw|spotted)\b[^.!?]{0,55}\b(?:weapon|belt\s+strike|illegal\s+blow)\b/iu.test(prose))
     throw new Error("Ringside treated a concealed weapon strike as an official award");
    if(source.matchContext?.finishProp==="CHAMPIONSHIP_BELT"&&
      source.fallout?.title?.priorHolderName===source.fallout?.title?.winnerName&&
      /\b(?:stole|stolen|stealing)\b[^.!?]{0,35}\b(?:championship|title|belt)\b/iu.test(prose))
     throw new Error("Ringside called the reigning champion's own belt stolen");
   }
   validateWrestlingMechanics(source,prose);
   if(["CLEAN_PIN","FLASH_PIN"].includes(source.outcome)){
    if(impossibleHoldCount(slot.recap))
     throw new Error("Ringside counted a clean pin while a submission hold remained locked");
    if(reportedTapInPinfall(slot.recap))
     throw new Error("Ringside described an actual tap-out in a certified pinfall");
    if(unseenCleanCount(slot.recap))
     throw new Error("Ringside counted a clean pin while the referee was looking away");
   }
   // A generated near-fall is fine; declaring that the defeated wrestler
   // actually pinned/submitted the recorded winner is not.
   const winners=source.matchContext?.winnerNames??[];
   const opponents=source.matchContext?.sides.flat()??[];
   // The referee must not count three on the official WINNER'S shoulders.
   // This inversion appeared in a published Místico/Regal foreign-object
   // recap even though the names and finish otherwise passed validation.
   if(["CLEAN_PIN","FLASH_PIN","FOREIGN_OBJECT","PROTECTED_FINISH"].includes(source.outcome)){
    for(const winner of winners){
     const escaped=[...winner].map(ch=>
      "\\^$.*+?()[]{}|".includes(ch)?"\\"+ch:ch).join("");
     const badPin=new RegExp(
      "(?:count(?:ed|s|ing)?\\s+(?:the\\s+)?(?:full\\s+)?three|"+
      "(?:three[-\\s]?count|pinfall|pinned|covered|cover(?:ed)?\\s+for\\s+three))"+
      "[^.!?]{0,95}\\b(?:on|over|against)\\s+"+
      escaped+"[’']s\\s+shoulders\\b","iu");
     const reversedCover=new RegExp(
      "\\b(?:count(?:ed|s)?\\s+(?:the\\s+)?three|pinned|covered)"+
      "[^.!?]{0,35}\\b"+escaped+"\\s+for\\s+(?:the\\s+)?(?:three|pin)","iu");
     if(badPin.test(prose)||reversedCover.test(prose))
      throw new Error("Ringside counted a pin on the official winner's shoulders");
    }
   }
   const language=prose.toLowerCase();
   for(const loser of opponents.filter(name=>!winners.includes(name))){
    for(const winner of winners){
     if([" pinned "," submitted "," defeated "].some(verb=>
      language.includes(loser.toLowerCase()+verb+winner.toLowerCase())))
      throw new Error("Ringside inverted the official match winner");
    }
   }
   const finish=source.outcome;
   const stipulated=source.matchContext?.format??"";
   if(finish==="VERBAL_SURRENDER"){
    if(!/\b(?:i quit|verbally surrender(?:ed)?|surrender(?:ed)? aloud|said (?:the|those) words|spoke (?:the|those) words|admitted defeat aloud)\b/i.test(prose))
     throw new Error("I Quit finish must describe verbal surrender");
    if(/\b(?:tapped(?:\s+out)?|tap-out|pinfall victory|three-count|referee stoppage)\b/i.test(prose))
     throw new Error("I Quit cannot end by tap, pin or stoppage");
   }
   if(stipulated.startsWith("Steel Cage")&&
    /\b(?:won|victory|prevailed|secured (?:the )?win)\b[^.!?]{0,60}\b(?:escap(?:e|ed|ing)|climb(?:ed|ing)? out)\b|\bescap(?:e|ed|ing)\b[^.!?]{0,50}\b(?:to win|for (?:the )?win|victory)\b/i.test(prose))
    throw new Error("Cage escape is not a certified win condition");
   if(finish==="CASKET_CLOSE"&&!/\b(?:casket|coffin)\b/i.test(prose))
    throw new Error("Casket victory omitted the casket");
   if(finish==="FIRST_BLOOD"&&!/\b(?:blood|bleed|bleeding|bled)\b/i.test(prose))
    throw new Error("First Blood omitted the decisive blood");
   if(["RETRIEVAL","TABLE_BREAK","TEN_COUNT","MOST_FALLS","SECOND_FALL",
     "VERBAL_SURRENDER","FIRST_BLOOD","CASKET_CLOSE"].includes(finish)&&
    /\b(?:won by (?:pinfall|submission)|pinned (?:him|her|them) for (?:the )?win|tapped out for (?:the )?win|three-count (?:secured|decided|won))\b/i.test(prose))
    throw new Error("Stipulation result replaced by an invalid finish");
   if(["CLEAN_PIN","FLASH_PIN"].includes(finish)&&(
    /\b(?:decisive|winning|match[- ]ending|finish(?:ing)?)\s+(?:submission|tap[- ]out)\b|\b(?:submission|tap[- ]out)\b[^.!?;]{0,75}\b(?:forc(?:e|ed|ing)|caus(?:e|ed|ing)|result(?:s|ed|ing)? in|produced?|deliver(?:s|ed|ing)?|sealed)\b[^.!?;]{0,35}\b(?:a\s+)?(?:clean\s+)?(?:pin(?:fall)?|three[- ]count)\b/i.test(prose)||
    /\b(?:forc(?:e|ed|ing)|made)\b[^.!?;]{0,80}\b(?:tap(?:ped)?[- ]out|submit(?:ted)?)\b[^.!?;]{0,80}\b(?:pin(?:fall)?|three[- ]count)\b/i.test(prose)||
    /\b(?:tap[- ]out|submission)\b[^.!?;]{0,55}\b(?:doubled as|counted as|became|was)\b[^.!?;]{0,40}\b(?:official\s+)?(?:pin(?:fall)?|three[- ]count)\b/i.test(prose)))
    throw new Error("A submission cannot itself secure the recorded pinfall");
   if(stipulated.startsWith("Steel Cage")&&
    /\b(?:cage(?:'s|’s)?|steel\s+cage)(?:\s+(?:had|has|with|beneath|under|above|its|the))?\s+(?:(?:low|closed|lowered|solid)\s+)?(?:roof|ceiling)\b|\b(?:cage(?:'s|’s)?\s+)?(?:low|lowered)\s+ceiling\b/i.test(prose))
    throw new Error("Steel Cage review invented an unsupported roof or ceiling");
   if(finish==="CLEAN_PIN"||finish==="FLASH_PIN"){
    const winners=new Set(source.matchContext?.winnerNames??[]);
    for(const p of source.performerIdentities??[]){
     if(!winners.has(p.ringName))continue;
     for(const move of p.finishingMoves){
      if(!/clutch|choke|crossface|sleeper|sharpshooter|armbar|anaconda|vise|submission lock/i.test(move))continue;
      const rec=moveSurface(slot.recap),term=moveSurface(move),at=rec.lastIndexOf(term);
      if(at>=0&&rec.length-at-term.length<110&&
       /\b(?:pin|three count|counted three|cover|pinned)\b/.test(rec.slice(at)))
       throw new Error("Submission finisher cannot secure a three-count");
     }
    }
   }
   if(finish!=="SUBMISSION"&&/\b(?:(?:won|wins?|prevailed|victory|defeated)\b[^.!?;]{0,42}\bby (?:a |the )?(?:submission|tap[- ]?out)|forced (?:the |a )?tap(?:-out)?|made (?:him|her|them) tap|tapped out to (?:the |a )?hold)\b/i.test(prose))
    throw new Error("Contradictory submission finish");
   if(finish==="SUBMISSION"&&/\b(?:pin(?:ned|fall)? (?:for |at )?the (?:win|victory)|pinned (?:him|her|them) for (?:the )?(?:three|win)|three-count to (?:win|victory))\b/i.test(prose))
    throw new Error("Contradictory pinfall finish");
   if(["DISQUALIFICATION","INJURY_STOPPAGE"].includes(finish)&&/\b(?:clean pinfall victory|pinned (?:him|her|them) (?:clean|for three)|clean three-count)\b/i.test(prose))
    throw new Error("Contradictory non-pinfall finish");
   if(finish==="FLASH_PIN"&&/\b(?:finished (?:him|her|them) with the [A-Za-z ]{4,50}|knocked (?:him|her|them) out for the pin)\b/i.test(prose))
    throw new Error("Flash pin described as an impact finish");
  }
  }catch(error){throw new RingsideSlotValidationError(i,error instanceof Error?
   error.message:"Editorial facts did not validate");}
 }
 return {showHeadline:v.showHeadline as string,opening:v.opening as string,
  closing:v.closing as string,slots};
}
/** Try to retain five useful AI reports instead of discarding a six-slot show
 * for one inconsistent match description. Each preserved model slot undergoes
 * the *same* final validation; only immutable, verified facts form fallbacks.
 */

/**
 * Groq may echo a PPW card label or internal editorial key while otherwise
 * writing a complete, accurate article. These are reader-facing presentation
 * defects, not grounds to buy another complete 9-card generation.
 * Change ONLY enumerated backstage tokens. Never alter names, winners,
 * moves, title facts, scores or the certified outcome. Revalidate the
 * whole article before accepting any cleaned draft.
 */
export function scrubRingsidePrivateMetadata(
 input:RingsideCopy,show:CompletedShowView):RingsideCopy|null{
 let changed=false;
 const scrub=(text:string,noun:"show"|"match"|"segment")=>{
  const label=(matched:string,possessive?:string)=>
   (/^[A-Z]/.test(matched)?"The ":"the ")+noun+(possessive??"");
  const next=text
   .replace(/\b(?:the\s+)?(?:card\s+segment\s+\d+|card[_\s-]*\d+|slot[_\s-]*\d+)\b(['’]s)?/giu,
    (match,_pos:string)=>label(match,_pos))
   .replace(/\b(?:the\s+)?week\s+\d{1,3}\b/giu,
    match=>(/^[A-Z]/.test(match)?"The show":"the show"))
   .replace(/\b(?:the\s+)?(?:showfocus(?:\.[a-z]+)?|editoriallens(?:\.[a-z]+)?|storythread(?:\.[a-z]+)?|director\.[a-z]+)\b/giu,
    match=>label(match))
   .replace(/\b(?:the\s+)?(?:rivalry thread|story thread|only recorded rivalry|recorded rivalry|official fallout|prior angles?|previous angles?|additional angles?|programme chapters?|scripted actions?)\b/giu,
    match=>(/^[A-Z]/.test(match)?"The situation":"the situation"))
   .replace(/[ \t]{2,}/g," ")
   .replace(/[ \t]+([,.;!?])/g,"$1");
  if(next!==text)changed=true;
  return next;
 };
 const cleaned:RingsideCopy={
  showHeadline:scrub(input.showHeadline,"show"),
  opening:scrub(input.opening,"show"),
  closing:scrub(input.closing,"show"),
  slots:input.slots.map((slot,i)=>({
   ...slot,
   headline:scrub(slot.headline,show.entries[i]?.type==="MATCH"?"match":"segment"),
   recap:scrub(slot.recap,show.entries[i]?.type==="MATCH"?"match":"segment")
  }))
 };
 return changed?cleaned:null;
}
export function cleanRingsidePrivateMetadata(
 input:RingsideCopy,show:CompletedShowView):RingsideCopy|null{
 const cleaned=scrubRingsidePrivateMetadata(input,show);
 if(!cleaned)return null;
 try{return validateRingsideCopy(cleaned,show);}
 catch{return null;}
}

export function buildVerifiedRingsideFallback(show:CompletedShowView):RingsideCopy{
 // When one AI slot fails, report its actual wrestlers and official method
 // instead of printing the old "decision in the ring" non-story. These
 // sentences contain no invented moves, dialogue, feud outcome or scorer.
 return {
  showHeadline:"Ringside: "+(show.showName??"The show").slice(0,90),
  opening:(show.promotionName??"The promotion")+" presented "+
   (show.showName??"its next card")+". Every finish below comes from the show.",
  closing:"The bell has sounded. What the promotion does with those results remains to be seen.",
  slots:show.entries.map(entry=>{
   if(entry.type==="SEGMENT"){
    const context=entry.segmentContext;
    const actors=context?.actorNames??[];
    const targets=context?.targetNames??[];
    const speaker=actors.join(" & ")||"The participants";
    const namedTargets=targets.join(" & ");
    const kind=entry.segmentKind??"SEGMENT";
    const place=context?.scene?.location;
    const locations:Record<string,string>={
     ENTRANCE_RAMP:"the entrance ramp",LOCKER_ROOM:"the locker room",
     INTERVIEW_AREA:"the interview area",VIDEO_SCREEN:"the arena screens",
     RING:"the ring",RINGSIDE:"ringside",BACKSTAGE:"backstage",
     OFFICE:"the office",CAR_PARK:"the car park",CROWD:"the audience",
     ARENA_FLOOR:"the arena floor"
    };
    const location=typeof place==="string"?locations[place]??"the arena":"the arena";
    const headline=kind==="DEBUT"?speaker+" arrives in "+(show.promotionName??"the promotion"):
     kind==="PROMO"?speaker+(namedTargets?" warns "+namedTargets:" addresses the crowd"):
     kind==="INTERVIEW"?speaker+(namedTargets?" calls out "+namedTargets:" speaks out"):
     kind==="VIDEO_PACKAGE"?speaker+(namedTargets?" and "+namedTargets:" in focus"):
     entry.headline||speaker+" on "+(show.showName??"the show");
    const setup=kind==="DEBUT"?speaker+" made a debut at "+location+".":
     kind==="PROMO"?speaker+" delivered a promo from "+location+
      (namedTargets?" directed at "+namedTargets:"")+".":
     kind==="INTERVIEW"?speaker+" spoke in "+location+
      (namedTargets?" about "+namedTargets:"")+".":
     kind==="VIDEO_PACKAGE"?"A video package on "+location+
      " focused on "+speaker+(namedTargets?" and "+namedTargets:"")+
      (context?.videoPurpose==="FEUD_RECAP"?
       ", revisiting the issue between them without adding a new confrontation.":"."):
     entry.summary.split(" The action unfolded:")[0]!.slice(0,250);
    const lines=(context?.scriptedActions??[]).filter(a=>
     typeof a.line==="string"&&a.line.trim().length>0).slice(0,3).map(a=>{
      const whoIndex=entry.actorIds.indexOf(a.by);
      const who=actors[whoIndex]??speaker;
      const toIndex=typeof a.to==="string"?entry.targetIds.indexOf(a.to):-1;
      const to=targets[toIndex]??"";
      return who+(to?" called out "+to:" said")+
       ": “"+a.line!.trim()+"”";
     });
    const scripted=lines.length?" "+lines.join(". ")+".":"";
    const end=entry.outcome==="REFUSED"?
     " The request was refused on air.":entry.outcome==="INTERRUPTED"?
      " The segment ended in an interruption.":"";
    const absent=namedTargets&&context?.targetPresence==="MENTIONED"&&
     ["PROMO","INTERVIEW","CHALLENGE","CONTRACT_SIGNING"].includes(kind)?
     " "+namedTargets+" did not appear in the scene.":"";
    return {slotId:entry.slotId,headline:headline.slice(0,140),
     recap:(setup+scripted+end+absent).slice(0,1600)};
   }
   const sides=entry.matchContext?.sides??[];
   const names=entry.matchContext?.winnerNames??[];
   const winner=names.length?names.join(" & "):"The contest";
   const opponents=sides.filter(side=>!side.some(n=>names.includes(n)))
    .flat().filter(Boolean).slice(0,5).join(" & ");
   const format=(entry.matchContext?.format??"match").replaceAll("_"," ").toLowerCase();
   const finish:Record<string,string>={
    CLEAN_PIN:"secured a clean pinfall",FLASH_PIN:"snatched a sudden pinfall",
    SUBMISSION:"earned a submission victory",
    DISQUALIFICATION:"took the decision by disqualification",
    FOREIGN_OBJECT:"emerged victorious after a controversial ending",
    PROTECTED_FINISH:"prevailed after a contentious ending",
    INJURY_STOPPAGE:"prevailed when the match was stopped",
    RETRIEVAL:"retrieved the suspended prize to claim victory",
    TABLE_BREAK:"won by putting the opponent through a table",
    TEN_COUNT:"won when the opponent failed to answer the ten-count",
    MOST_FALLS:"was ahead on falls when the Iron Man clock expired",
    SECOND_FALL:"secured the decisive second fall",
    VERBAL_SURRENDER:"won when the opponent verbally surrendered, saying 'I quit'",
    FIRST_BLOOD:"won after the opponent was the first to bleed",
    CASKET_CLOSE:"won by shutting the casket lid on the opponent"};
   const result=names.length?winner+" "+(finish[entry.outcome]??"won the match"):
    "The contest ended without a recorded winning side";
   const reaction=entry.crowdResponse>=75?
    "The crowd responded strongly to the decision.":
    entry.crowdResponse<45?"The response was noticeably quiet.":
     "The reaction was mixed.";
   const matchup=sides.length>=2?sides.map(side=>side.join(" & ")).join(" against "):
    (opponents?winner+" against "+opponents:winner);
   const when=entry.fallout?.actualMinutes!==undefined&&
    entry.fallout.actualMinutes!==null?
    " After "+entry.fallout.actualMinutes+" minutes, ":" ";
   const ordinal=["opening","second","third","fourth","fifth","sixth","seventh",
    "eighth","ninth","tenth"][entry.position]??"later";
   return {slotId:entry.slotId,
    headline:(entry.headline||winner+(opponents?" defeats "+opponents:" wins")).slice(0,140),
    recap:("In the "+ordinal+" bout, "+matchup+" met in a "+format+"."+
     when+result+". "+reaction).slice(0,1750)};
  })
 };
}
export function recoverRingsideCopy(input:unknown,show:CompletedShowView):
 {review:RingsideCopy;replaced:number}|null{
 const raw=shape(input);
 if(!raw||!Array.isArray(raw.slots)||raw.slots.length!==show.entries.length||
  show.entries.length<4)return null;
 const maxFallback=Math.min(2,Math.floor(show.entries.length/3));
 const base=buildVerifiedRingsideFallback(show);
 try{validateRingsideCopy(base,show);}catch{return null;}
 const next:RingsideCopy={...base,slots:[...base.slots]};
 if(typeof raw.showHeadline==="string"&&typeof raw.opening==="string"&&
  typeof raw.closing==="string"){
  const intro={...next,showHeadline:raw.showHeadline,
   opening:raw.opening,closing:raw.closing};
  try{validateRingsideCopy(intro,show);
   next.showHeadline=intro.showHeadline;next.opening=intro.opening;
   next.closing=intro.closing;
  }catch{/* Do not allow unsafe global prose. */}
 }
 let replaced=0;
 for(let i=0;i<show.entries.length;i++){
  const slot=shape(raw.slots[i]);
  if(!slot||slot.slotId!==show.entries[i]!.slotId){replaced++;continue;}
  const withSlot=[...next.slots];
  withSlot[i]={slotId:slot.slotId as string,headline:slot.headline as string,
   recap:slot.recap as string};
  try{validateRingsideCopy({...next,slots:withSlot},show);next.slots=withSlot;}
  catch{replaced++;}
 }
 if(replaced>maxFallback)return null;
 try{return {review:validateRingsideCopy(next,show),replaced};}
 catch{return null;}
}


/**
 * Curated real-world wrestling history, independent of Groq. One short aside
 * at most, on a deterministic minority of shows. It is commentary, NEVER a
 * PPW career event, historical programme memory or simulated match fact.
 * Benchmarks: Hogan/André (WrestleMania III), Michaels/Ramon (WM X),
 * Hart/Austin (WM 13), Rock/Hogan (WM X8), Okada/Omega (Dominion 2018),
 * Undertaker/Michaels (WM 25). The original event identities were verified.
 * No model tokens, Neon queries, state changes, random rerolls or UI work.
 */
export function withOccasionalWrestlingHistory(
 review:RingsideCopy,show:CompletedShowView):RingsideCopy{
 const key=show.showId+"|"+show.year+"|"+show.week;
 let hash=2166136261;
 for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
 if(hash%4!==0)return review;
 const candidates:{i:number;line:string}[]=[];
 for(const [i,e] of show.entries.entries()){
  if(e.type!=="MATCH"||!e.matchContext||
   typeof e.fallout?.ratingStars!=="number"||!review.slots[i])continue;
  const stars=e.fallout.ratingStars;
  const length=e.fallout.actualMinutes??e.matchContext.plannedMinutes??0;
  const format=e.matchContext.format.toLowerCase();
  const field=e.matchContext.sides.flat().join(" ").toLowerCase();
  let line:string|null=null;
  if(stars<2.5&&length>=8&&e.crowdResponse<=65)
   line="It was Hogan versus André at WrestleMania III without the spectacle — and somehow made that old clash look like a technical masterclass.";
  else if(/ladder|tlc/.test(format)&&e.outcome==="RETRIEVAL"&&stars>=4)
   line="Michaels and Razor Ramon at WrestleMania X remain the ladder-match measuring stick; this at least understood why every climb must matter.";
  else if(e.outcome==="SUBMISSION"&&stars>=4.25&&e.crowdResponse>=75)
   line="Hart and Austin at WrestleMania 13 made resistance unforgettable. This wasn't that landmark, but the submission struggle understood the assignment.";
  else if(stars>=4.75&&length>=22&&e.crowdResponse>=88)
   line="For a moment the suspense invited thoughts of Undertaker and Michaels at WrestleMania 25. A lofty comparison, but the crowd had earned it.";
  else if(stars>=4.5&&length>=25)
   line="Okada and Omega at Dominion 2018 set a fearsome standard for endurance; this contest at least understood the value of a long, escalating fight.";
  else if(stars>=4&&e.crowdResponse>=89)
   line="There was a flicker of Rock–Hogan at WrestleMania X8 in the crowd's reaction: sometimes the audience becomes half the story.";
  if(!line)continue;
  // If a real-world reference includes an actual on-card wrestler, prefer
  // another scene rather than implying PPW's own career has that history.
  const nameClash=(line.includes("André")&&/hogan|andre/.test(field))||
   (line.includes("Ramon")&&/michaels|ramon/.test(field))||
   (line.includes("Austin")&&/hart|austin/.test(field))||
   (line.includes("Undertaker")&&/undertaker|michaels/.test(field))||
   (line.includes("Okada")&&/okada|omega/.test(field))||
   (line.includes("Rock–Hogan")&&/rock|hogan/.test(field));
  if(!nameClash&&review.slots[i]!.recap.length+line.length+2<=1800)
   candidates.push({i,line});
 }
 if(!candidates.length)return review;
 const selected=candidates[Math.floor(hash/4)%candidates.length]!;
 const slots=review.slots.map((slot,i)=>i===selected.i?{
  ...slot,recap:slot.recap.trimEnd()+"\n\n"+selected.line}:slot);
 try{return validateRingsideCopy({...review,slots},show);}
 catch{return review;}
}

/** An accurate scorecard paragraph cannot stand in for a major match review.
 * This quality gate applies only to newly generated articles and recovery,
 * never to certified World data or previously published cached reports.
 */
export function ringsideReaderQualityIssue(
 review:RingsideCopy,show:CompletedShowView):string|null{
 if(show.entries.length<4)return null;
 for(const [i,e] of show.entries.entries()){
  if(e.type!=="MATCH")continue;
  const stars=e.fallout?.ratingStars,mins=e.fallout?.actualMinutes??
   e.matchContext?.plannedMinutes??0;
  if(typeof stars!=="number"||stars<3||mins<10)continue;
  const recap=review.slots[i]?.recap??"";
  const count=recap.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length??0;
  const minimum=stars>=4.25?65:48;
  if(count<minimum||
   /^in the (?:opening|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|later) bout\b/i.test(recap))
   return "Ringside underwrote a significant match at card_"+i+
    ": players need a vivid specific account, not a generic result";
 }
 return null;
}
/** Atmospheric description for the writer; the UI retains canonical numbers. */
const crowdMood=(n:number)=>n>=84?"strongly responsive":n>=70?"loud":n>=56?"engaged":
 n>=42?"divided":n>=28?"muted":"quiet";
/** One truthful editorial angle per slot. The previous round-robin cue
 * encouraged the model to invent "shifting allegiance" in unrelated matches.
 * These are writing priorities, never new canonical event facts.
 */
export function ringsideEditorialLens(e:ShowResultEntry):string{
 if(e.type==="SEGMENT"){
  if(["INTERVIEW","PROMO","CHALLENGE"].includes(e.segmentKind??""))
   return "character point; no invented entrance";
  if(["ATTACK","POST_MATCH_ASSAULT","RESCUE"].includes(e.segmentKind??""))
   return "booked action and response";
  return "filmed beat; no unseen change";
 }
 if(e.outcome==="FOREIGN_OBJECT")
  return "referee sightline; cheating; winner";
 if(e.outcome==="DISQUALIFICATION")
  return "DQ foul; awarded winner";
 if(e.outcome==="VERBAL_SURRENDER")
  return "resistance; spoken surrender, no tap";
 if(e.outcome==="RETRIEVAL"||e.outcome==="MOST_FALLS")
  return "stipulation pressure; certified win";
 const minutes=e.fallout?.actualMinutes??e.matchContext?.plannedMinutes??0;
 const rating=e.fallout?.ratingStars;
 if(minutes>0&&minutes<=6)
  return "brief, decisive action";
 const format=wrestlingMatchIQ(e)?.format;
 if(format==="TAG"||format==="MULTI_TEAM")
  return typeof rating==="number"&&rating<2.5?
   "legal tags; awkward pacing":
   "legal tags; team pacing";
 if(typeof rating==="number"&&rating<2.5)
  return "what fell flat; no false ovation";
 if(typeof rating==="number"&&rating>=4)
  return "strong exchange; precise finish";
 return "tactics; certified finish";
}

/** A big reaction must be earned by the actual match and crowd, not
 * manufactured for every short bout. A two-count is temporary ring colour,
 * never a certified finish or a claim the wrestler already won.
 */
export function ringsideDramaCue(entry:ShowResultEntry):string|null{
 if(entry.type!=="MATCH")return null;
 if(!["CLEAN_PIN","FLASH_PIN","SUBMISSION","SECOND_FALL"].includes(entry.outcome))
  return null;
 // A submission-only stipulation cannot have a legitimate pin near-fall.
 if(entry.outcome==="SUBMISSION"&&
  /^(?:Submission(?: Only)? Match|Submission Only)\b/i.test(
   entry.matchContext?.format??""))return null;
 const mins=entry.fallout?.actualMinutes??entry.matchContext?.plannedMinutes??0;
 const stars=entry.fallout?.ratingStars??0;
 if(mins<12||stars<3.75||entry.crowdResponse<70)return null;
 return stars>=4.25&&entry.crowdResponse>=80?"PEAK":"EARNED";
}
/** Send relevant certified facts once, without redundant IDs and analytics. */
export function ringsideBrief(show:CompletedShowView,memory:RingsideMemory={priorMatches:[],programmes:[]}){
 const slotStories=verifiedSlotStoryThreads(show,memory);
 return {show:show.showName??"Weekly show",year:show.year,week:show.week,
  audienceMood:crowdMood(show.crowdResponse),
  showFocus:directRingsideShow(show),
  slots:show.entries.map((e,i)=>({
   editorialLens:ringsideEditorialLens(e),
   director:e.type==="MATCH"?directRingsideMatch(e):directRingsideAngle(e),
   ...(ringsideDramaCue(e)?{dramaticCue:ringsideDramaCue(e)}:{}),
   key:"card_"+i,type:e.type,finish:e.outcome,audienceMood:crowdMood(e.crowdResponse),
   summary:e.summary,
   ...(ringsideViewerCallback(slotStories[i]??null)?{
    storyThread:ringsideViewerCallback(slotStories[i]??null)}:{}),
   ...(e.matchContext?{match:{format:e.matchContext.format,
    ...(wrestlingMatchIQ(e)?{wrestlingIQ:{
     format:wrestlingMatchIQ(e)!.format,
     tempo:(e.fallout?.actualMinutes??e.matchContext.plannedMinutes??12)<7?"BRIEF":
      (e.fallout?.actualMinutes??e.matchContext.plannedMinutes??12)>=20?"LONG":"STANDARD",
     ...(wrestlingMatchIQ(e)!.format==="TAG"?{beat:"tag drama optional"}:
      wrestlingMatchIQ(e)!.format==="MULTI_TEAM"?{beat:"team tags; no guessed rotation"}:
      wrestlingMatchIQ(e)!.format==="BATTLE_ROYAL"?{beat:"survive, over-rope eliminations"}:
      wrestlingMatchIQ(e)!.format==="MULTI_PERSON"?{beat:"break covers; no tags"}:{})
    }}:{}),
    sides:e.matchContext.sides,winners:e.matchContext.winnerNames,
    ...(e.matchContext.finishProp?{bookedWeapon:finishPropLabel(e.matchContext.finishProp)}:{}),
    ...(e.matchContext.refereeSpot?{refereeSpot:e.matchContext.refereeSpot}:{}),
    titleContested:e.matchContext.championshipContested,
    ...(verifiedStipulationNote(e.matchContext.format,e.outcome)?{
     stipulationRules:verifiedStipulationNote(e.matchContext.format,e.outcome)}:{})}}:{}),
   ...(e.segmentContext?{angle:e.segmentContext}:{}),
   ...(e.segmentKind?{kind:e.segmentKind}:{}),
   ...(e.fallout?{fallout:{
    stars:e.fallout.ratingStars,minutes:e.fallout.actualMinutes,
    title:e.fallout.title,injuries:e.fallout.injuries,
    interference:e.fallout.interference,cheater:e.fallout.finishCheaterName,
    eliminations:e.fallout.eliminations}}:{}),
   wrestlers:(e.performerIdentities??[]).map(p=>({
    name:p.ringName,character:p.character,style:p.style,
    signatures:p.signatureMoves.slice(0,3),finishers:p.finishingMoves.slice(0,3)
   }))
  }))};
}

export const RINGSIDE_STYLE_GUIDE=`You are Marty Vale, an experienced WRESTLING JOURNALIST reviewing an
actual televised wrestling show for the game's players. You WATCHED it.
Write an enjoyable, immersive article, not a scorecard. Bring matches,
characters and stakes alive with concrete action and credible judgement.
Be funny when earned; critique weak bouts. Never sound like the game engine.

Write ONE chronological article. For EVERY match use slot.director:
setup, turn, ONE decisive finish, rating-scaled verdict. Its exchanges
are suggested colour, not certified spots; slot.finish always wins.
Matches 90–150 words, squashes 55–100, angles 35–85.
Only slot.dramaticCue=PEAK may BURST into "ONE! TWO! ... KICKOUT!"
or a rare "HOLY SHIT!" at an earned near-fall. EARNED merits interest,
not a miracle; never force profanity or oversell a flat match.
A two-count stops BEFORE THREE. Only a move's owner lands it;
the wrestler kicking OUT is the recipient. Repertoire is colour, not fact.
Headlines must be specific, not bloated; don't repeat the opening sentence.
slot.director sets emphasis, never new facts.
Avoid "In the end", "momentum shifted", recycled moves, "looming storms",
"unstoppable auras", "hushed reverence", "electric crowds" and invented
camera shots. Motives and relationships need on-air evidence.

Slot facts govern cast, finish, titles, injuries, interference and crowd.
A belt changes hands ONLY when fallout.title.changed is true; the match
winner is NOT automatically champion. No invented title defence.
A booked championship belt is legal to own; using it to STRIKE is the foul.
If the winner already held that championship, it is the champion's OWN belt.
With a referee bump the foul happens unseen; the referee must recover to
count the later cover. The referee never awards a win FOR the illegal strike.
Match.format and stipulationRules set legal win methods and pacing;
possibleSpots are possibilities, not settled action. Invent temporary
bell-to-bell colour, NOT winners, quotes, scores, attacks, injuries, title
changes, debuts, turns or any lasting consequence. Never assign another
wrestler's signature and scale reactions to the verified crowd.
Singles: two wrestlers. No tags or tag partners.
Tags/trios: only one wrestler PER TEAM is legal; apron partners must tag
before scoring; hot tags optional. Never invent a team fall scorer.
Preserve multi-team sides. Triple/four-way: there are NO tags.
Battle royals: over-the-top eliminations, not pins. Follow referee rules.

Multi-person fall victims may be UNRECORDED: never name an unverified
pinned, cradled or rolled-up rival. Say only that the winner stole the fall.
ONLY the losing wrestler's shoulders are counted in a pinfall, NEVER
the official WINNER's, even with a foreign object. Check cover and method.
CLEAN_PIN requires a legal three-count; FLASH_PIN a sudden roll-up.
SUBMISSION is a tap/stoppage, NOT a pin. A referee never counts taps.
Samoa Joe's Coquina Clutch
cannot score a pin; Muscle Buster may precede one. An earlier hold can
set up a separate pin ONLY after the hold is released or escaped.
In a pinfall match, nobody actually taps out; that ends the bout.
Never count three with a locked hold or force shoulders down with a heel hook.
DISQUALIFICATION is not a pin. FOREIGN_OBJECT: use ONLY the verified
match.bookedWeapon, if present. No invented substitute. Otherwise say
concealed cheating, without naming a weapon. PROTECTED_FINISH implies
no automatic outsider or weapon. INJURY_STOPPAGE is no pin/submission.
I QUIT requires actual verbal surrender, often into a referee's
microphone, never a tap or pin. The pressure should visibly escalate
through resistance before one final "I quit"; no automatic blood,
weapon or diagnosed injury. A standard Steel Cage has no ceiling or
roof: make the wall/mesh/limited space affect plausible action,
but NEVER claim cage escape wins if the record says pinfall.
Iron Man ends when the clock expires with the most falls, not one
normal cover; no invented exact score. Two out of Three Falls ends on
the decisive second fall. Ladder/TLC wins require retrieval; Tables
a table break; Last Man Standing an unanswered ten-count; First Blood
the first bleeding; Casket the closed lid. Follow the slot's explicit
stipulationRules if present.

Angles are filmed scenes, NOT bouts. Use slot.director for each angle
kind; a high-rated debut must feel like an arrival, interviews should
reveal character, and packages should sell the verified stakes. Narrate
angle.scriptedActions in order; quote only these authored lines.
Speech alone cannot imply a strike, move or brawl. Spoken-only angles permit NO wrestling moves, strikes, dropkicks or brawls. Only ATTACK,
FIGHT_BACK, RESCUE or BETRAY authorises physical conflict. A PROMO's
actorNames speak; angle.targetPresence distinguishes targets MENTIONED
(off-camera, unable to enter, reply or fight) from targets ON_SCREEN.
Do not invent outsiders, entrances, physical traits, friendship or
partnership. BLOODIED isn't an injury; planned retaliation isn't done.
Refusal or interruption isn't success.
Only scoped storyThread proves past events. Use one viewer-facing callback
at most; one shared match doesn't prove a feud. Never expose raw history or database bookkeeping,
'third angle', 'rivalry thread', 'official fallout', 'prior angles',
'card segment' or 'Week 25'.
A recap video sells the real issue, not a list of what it did NOT introduce.
Do not invent montages of moves, previous near-falls or filmed historic encounters.
Never invent a replay, prior victory or what the footage depicted.
Do not write historical wrestling-match comparisons: PPW's editorial desk
adds rare, carefully verified historical asides separately.
showFocus.lead is the show's opening/headline priority; the support slots
inform the close. Cover EVERY card chronologically. Never write card numbers,
slot IDs, focus keys or editorial instructions into the reader's article.
Use wrestling terms naturally. Never expose star ratings, mechanics,
technical booking labels or equations. Avoid unsupported gender assumptions.
JSON only: card_0, card_1 etc (every card_N key once), each with
headline and recap. Do not emit slotId fields: the server restores immutable IDs.
`;
