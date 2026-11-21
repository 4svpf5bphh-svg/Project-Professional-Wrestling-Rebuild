import {finishPropLabel} from "./bookable-match.js";
/** A full-card editorial projection. It never writes simulation facts. */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import type {RingsideMemory} from "../db/ringside-continuity.js";
import {verifiedSlotStoryThreads} from "./ringside-story-threads.js";
import {wrestlingMatchIQ,validateWrestlingMechanics} from "./wrestling-iq.js";
import {MATCH_STIPULATIONS,type MatchStipulation} from "./match-stipulations.js";
// Updated editorial is versioned independently. Published v4 remains immutable.
export const RINGSIDE_PROMPT_VERSION="ringside-v9";
export const RINGSIDE_PREVIOUS_VERSION="ringside-v7";
export const RINGSIDE_OLDER_VERSION="ringside-v6";
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
 if(source.type!=="SEGMENT"||source.segmentKind!=="PROMO"||
  !source.segmentContext||
  source.segmentContext.targetPresence==="ON_SCREEN")return;
 const actors=new Set(source.segmentContext.actorNames.map(x=>x.toLocaleLowerCase()));
 for(const name of source.segmentContext.targetNames){
  if(actors.has(name.toLocaleLowerCase())||!name.trim())continue;
  const target=literalPattern(name);
  const body=new RegExp(
   "(?:^|[^\\p{L}\\p{N}])"+target+
   "(?:\\s+|['’]s\\s+)"+
   "(?:answered|replied|responded|interrupted|stepped|walked|ran|"+
   "charged|stood|approached|entered|arrived|appeared|performed|"+
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

export function validateRingsideCopy(candidate:unknown,show:CompletedShowView):RingsideCopy{
 const v=shape(candidate);
 if(!v||Object.keys(v).some(k=>!["showHeadline","opening","closing","slots"].includes(k))||
  !printable(v.showHeadline,140)||!printable(v.opening,900)||
  !printable(v.closing,650)||!Array.isArray(v.slots)||
  v.slots.length!==show.entries.length)throw new Error("Untrusted ringside review shape");
 const slots=v.slots.map((raw:unknown,i:number)=>{
  const s=shape(raw),canonical=show.entries[i];
  if(!s||Object.keys(s).some(k=>!["slotId","headline","recap"].includes(k))||
   s.slotId!==canonical.slotId||!printable(s.headline,150)||
   !printable(s.recap,1800))throw new Error("Ringside review changed card order or slot facts");
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
    throw new Error("Ringside used an unowned signature move");
  }
 }
 // Reject unpublished editorial echoes without modifying canonical match facts.
 const usedSentences=new Set<string>();
 const openers=new Map<string,number>();
 for(const slot of slots){
  for(const sentence of slot.recap.split(/(?<=[.!?])\s+|\n+/)){
   const normalized=moveSurface(sentence);
   if(normalized.length>=65){
    if(usedSentences.has(normalized))
     throw new Error("Ringside repeated a full sentence across card entries");
    usedSentences.add(normalized);
   }
  }
  const opener=moveSurface(slot.recap).split(" ").slice(0,7).join(" ");
  if(opener.split(" ").length===7){
   const count=(openers.get(opener)??0)+1;
   if(count>=3)throw new Error("Ringside repeated a stock opening across card entries");
   openers.set(opener,count);
  }
 }
 const fullStory=[v.showHeadline,v.opening,v.closing,...slots.flatMap(x=>[x.headline,x.recap])].join(" ");
 if(/\b(?:protected finish|foreign object|booking intent|scored compatibility|execution quality|crowd score|crowd meter|cheer meter|reaction score|booking grade|chemistry modifier|execution modifier|recorded finish|official record|simulation result)\b/i.test(fullStory))
  throw new Error("Ringside leaked technical simulation terminology");
 if(/\b\d{1,3}\s*\/\s*100\b|\b\d{2,3}\.\d+\b|\b\d{1,3}\s*%\s*(?:crowd|cheers|reaction)\b|\b[0-5](?:\.\d{1,2})?[\s\-\u2010-\u2015]*stars?\b/i.test(fullStory))
  throw new Error("Ringside leaked numerical score into editorial");
 for(const [i,slot] of slots.entries()){
  const source=show.entries[i]!;
  const prose=slot.headline+" "+slot.recap;
  const hadTitleChange=source.fallout?.title?.changed===true;
  const hadInjury=(source.fallout?.injuries.length??0)>0;
  const hadInterference=source.fallout?.interference!==undefined;
  // A model-authored spot is flavour, not authority to create permanent
  // consequences. Confirmed fallout appears separately in the official UI.
  const goldClaims=source.type==="MATCH"&&
   [...prose.matchAll(/\b(?:captur(?:e|ed|es|ing)|claim(?:ed|s|ing)|win(?:s|ning)?|secur(?:e|ed|es|ing))\s+(?:(?:the|a|an|his|her|their|vacant|world|tag|women's|intercontinental|universal|heavyweight|singles)\s+){0,4}(?:title|championship|gold|belt)\b/gi)]
    .some(hit=>{
     const before=prose.slice(Math.max(0,(hit.index??0)-35),hit.index);
     return !/(?:\b(?:did|could|would|will|does|do)\s+not|\b(?:never|didn't|couldn't|wouldn't|failed\s+to|unable\s+to))\s*$/i.test(before);
    });
  if(!hadTitleChange&&(/\b(?:new (?:world |tag |women's )?champion|captured the (?:world |tag |women's )?title|title (?:changed hands|switch(?:ed|es) hands)|(?:won|claimed) the championship)\b/i.test(prose)||goldClaims))
   throw new Error("Invented championship change");
  // A physical trademark injury/defect must come from the certified
  // character or medical record, not a writer's improvised description.
  if(/\b(?:signature|trademark|famous)\s+(?:[\p{L}-]+\s+){0,3}(?:limp|scar|tattoo|injury)\b|\beyes?\s+(?:shining|sparkling)\b/iu.test(prose))
   throw new Error("Ringside invented unsupported physical traits");
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
   validateWrestlingMechanics(source,prose);
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
   if(finish!=="SUBMISSION"&&/\b(?:won by submission|forced (?:the |a )?tap(?:-out)?|made (?:him|her|them) tap|tapped out to (?:the |a )?hold)\b/i.test(prose))
    throw new Error("Contradictory submission finish");
   if(finish==="SUBMISSION"&&/\b(?:pin(?:ned|fall)? (?:for |at )?the (?:win|victory)|pinned (?:him|her|them) for (?:the )?(?:three|win)|three-count to (?:win|victory))\b/i.test(prose))
    throw new Error("Contradictory pinfall finish");
   if(["DISQUALIFICATION","INJURY_STOPPAGE"].includes(finish)&&/\b(?:clean pinfall victory|pinned (?:him|her|them) (?:clean|for three)|clean three-count)\b/i.test(prose))
    throw new Error("Contradictory non-pinfall finish");
   if(finish==="FLASH_PIN"&&/\b(?:finished (?:him|her|them) with the [A-Za-z ]{4,50}|knocked (?:him|her|them) out for the pin)\b/i.test(prose))
    throw new Error("Flash pin described as an impact finish");
  }
 }
 return {showHeadline:v.showHeadline as string,opening:v.opening as string,
  closing:v.closing as string,slots};
}
/** Try to retain five useful AI reports instead of discarding a six-slot show
 * for one inconsistent match description. Each preserved model slot undergoes
 * the *same* final validation; only immutable, verified facts form fallbacks.
 */
export function recoverRingsideCopy(input:unknown,show:CompletedShowView):
 {review:RingsideCopy;replaced:number}|null{
 const raw=shape(input);
 if(!raw||!Array.isArray(raw.slots)||raw.slots.length!==show.entries.length||
  show.entries.length<4)return null;
 const maxFallback=Math.min(2,Math.floor(show.entries.length/3));
 const ordinals=["opening","second","third","fourth","fifth","sixth",
  "seventh","eighth","ninth","tenth","eleventh","twelfth",
  "thirteenth","fourteenth","fifteenth","sixteenth","seventeenth",
  "eighteenth","nineteenth","twentieth","twenty-first","twenty-second",
  "twenty-third","twenty-fourth","twenty-fifth","twenty-sixth",
  "twenty-seventh","twenty-eighth","twenty-ninth","thirtieth"];
 const ordinal=(n:number)=>ordinals[n]??"later";
 const base:RingsideCopy={
  showHeadline:"Ringside: "+(show.showName??"The show").slice(0,90),
  opening:"The crowd gathered for a full night of wrestling.",
  closing:"The final bell gave the audience plenty to discuss.",
  slots:show.entries.map((entry,i)=>{
   if(entry.type==="SEGMENT"){
    const angleIndex=show.entries.slice(0,i).filter(e=>e.type==="SEGMENT").length;
    const result=entry.outcome==="REFUSED"?"was refused":
     entry.outcome==="INTERRUPTED"?"was interrupted":"took place";
    return {slotId:entry.slotId,headline:"A moment outside the ring",
     recap:"The "+ordinal(angleIndex)+" segment of the evening, "+
      entry.headline.replace(/[.!?]+$/,"")+", "+result+
      ". The audience has seen the outcome, whatever the intent."};
   }
   const names=entry.matchContext?.winnerNames??[];
   const winner=names.length?names.join(" & "):"The winning side";
   // Recovered editorial must preserve every unusual certified finish, not
   // collapse I Quit, Casket, Iron Man or other stipulations to "won the match".
   // This is pure local fallback: no second model call or history query.
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
   const boutIndex=show.entries.slice(0,i).filter(e=>e.type==="MATCH").length;
   return {slotId:entry.slotId,headline:"The decision in the ring",
    recap:"The "+ordinal(boutIndex)+" bout belonged to "+winner+", who "+
     (finish[entry.outcome]??"won the match")+
     ". The result settled the contest in front of the crowd."};
  })
 };
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
   return "one clear character point; quote only scripted words; no invented entrance";
  if(["ATTACK","POST_MATCH_ASSAULT","RESCUE"].includes(e.segmentKind??""))
   return "who acted, what was actually shown and the on-screen response";
  return "one visible development; no promised outcome or unseen consequence";
 }
 if(e.outcome==="FOREIGN_OBJECT")
  return "referee sightline, actual cheating and who won; avoid a reversed cover";
 if(e.outcome==="DISQUALIFICATION")
  return "observed foul, referee decision and whose victory the decision awarded";
 if(e.outcome==="VERBAL_SURRENDER")
  return "resistance, escalation and one spoken surrender; never a tap or pin";
 if(e.outcome==="RETRIEVAL"||e.outcome==="MOST_FALLS")
  return "stipulation pressure and the certified winning condition";
 const minutes=e.fallout?.actualMinutes??e.matchContext?.plannedMinutes??0;
 const rating=e.fallout?.ratingStars;
 if(minutes>0&&minutes<=6)
  return "a brief, decisive contest; no invented epic comeback or long exchanges";
 if(typeof rating==="number"&&rating<2.5)
  return "one credible moment and what fell flat; no false standing ovation";
 if(typeof rating==="number"&&rating>=4)
  return "one distinctive exchange that earns the strong reaction; precise finish";
 const format=wrestlingMatchIQ(e)?.format;
 if(format==="TAG"||format==="MULTI_TEAM")
  return "legal tags and team pacing, not an invented precise fall scorer";
 return "tactical contrast, a real turning point and the recorded finish";
}

/** Send relevant certified facts once, without redundant IDs and analytics. */
export function ringsideBrief(show:CompletedShowView,memory:RingsideMemory={priorMatches:[],programmes:[]}){
 const slotStories=verifiedSlotStoryThreads(show,memory);
 return {show:show.showName??"Weekly show",year:show.year,week:show.week,
  audienceMood:crowdMood(show.crowdResponse),
  slots:show.entries.map((e,i)=>({
   editorialLens:ringsideEditorialLens(e),
   key:"card_"+i,type:e.type,finish:e.outcome,audienceMood:crowdMood(e.crowdResponse),
   summary:e.summary,
   ...(slotStories[i]?{storyThread:slotStories[i]}:{}),
   ...(e.matchContext?{match:{format:e.matchContext.format,
    ...(wrestlingMatchIQ(e)?{wrestlingIQ:{
     format:wrestlingMatchIQ(e)!.format,
     tempo:(e.fallout?.actualMinutes??e.matchContext.plannedMinutes??12)<7?"BRIEF":
      (e.fallout?.actualMinutes??e.matchContext.plannedMinutes??12)>=20?"LONG":"STANDARD",
     beat:wrestlingMatchIQ(e)!.format==="TAG"?"tag drama optional":
      wrestlingMatchIQ(e)!.format==="MULTI_TEAM"?"team tags; no guessed rotation":
      wrestlingMatchIQ(e)!.format==="BATTLE_ROYAL"?"survive, over-rope eliminations":
      wrestlingMatchIQ(e)!.format==="MULTI_PERSON"?"break covers; no tags":
      "build to one legal finish"
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

export const RINGSIDE_STYLE_GUIDE=`You are Marty Vale, PPW Ringside's sharp, funny-when-earned
veteran wrestling columnist. Write as a smark who WATCHED the action,
not a game engine, booker, press release or omniscient narrator.
Have opinions grounded in EVIDENCE. Show one memorable exchange, mistake
or finish that explains why THIS match was worth seeing. Criticise flat bouts.
Dry humour sparingly; never just list moves or announce crowd approval.

Write ONE chronological article, not separate reports. For EVERY match,
give tactical contrast, a turning point and ONE decisive certified finish;
vary rhythm and emphasis. Near-falls are not victories.
Strong bouts 90–150 words, squashes 55–100, angles 35–85.
Let standout contests breathe; don't claim every bout stole the show.
Headlines must be specific, not bloated finish descriptions; do not repeat
them in the first sentence. Slot.editorialLens sets emphasis, NOT new facts.
Avoid "In the end", "momentum shifted", recycled moves, "looming storms",
"unstoppable auras", "hushed reverence", "electric crowds" and invented
camera shots. Motives and relationships need on-air evidence.

The slot records are AUTHORITATIVE: participant names, match format,
winner, winning method, title movement, injured wrestlers, interference,
angle outcomes and audience mood. If slot.fallout.title.changed is false,
slot.fallout.title.winnerName names the MATCH winner, not necessarily the
champion. The priorHolderName retains the belt when different from the
match winner; with no prior holder the title stays vacant. Only changed:true
certifies a new champion. Do not call a challenger's DQ win a title defence. Match.wrestlingIQ gives the legal
format and psychology; slot.match.stipulationRules gives the real
winning condition and suggested dramatic beats. Those beats and
possibleSpots are creative possibilities, NOT certified event records.
Invent only plausible, temporary bell-to-bell colour (counters,
selling, grappling, strikes, near-falls, crowd texture, taunts),
not a different winner, exact scores, outside attacker, title change,
serious injury, debut, actual quotation or permanent storyline consequence.
Treat one wrestler's repertoire as available moves, never proof a
particular move caused the finish. Never assign another wrestler's
signature move. Use official audience mood qualitatively.

Singles: two wrestlers. No tags or tag partners.
Tags/trios: only one wrestler PER TEAM is legal; apron partners must tag
before scoring; hot tags optional. Never invent a team fall scorer.
Preserve multi-team sides. Triple/four-way: there are NO tags.
Battle royals: over-the-top eliminations, not pins. Follow referee rules.

In a pinfall, ONLY the losing wrestler's shoulders are counted down. Never
write that the referee counted three on the official WINNER's shoulders,
even in a disputed or foreign-object finish. Recheck winner, defeated
wrestler, cover and method before writing the last sentence.
CLEAN_PIN requires a legal three-count; FLASH_PIN a sudden roll-up.
SUBMISSION is a tap/stoppage, NOT a pin. Samoa Joe's Coquina Clutch
cannot score a pin; Muscle Buster may precede one. An earlier hold can
set up a separate pin, but cannot ITSELF score it.
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

Angles are filmed scenes, not bouts. Use verified initiator, victim,
location, outcome, scene purpose and visible scripted aftermath.
angle.scriptedActions are the ONLY directed beats: narrate them IN ORDER,
preserving exact quoted lines. With spoken-only actions, NO wrestling moves, strikes, dropkicks or brawls.
Presence alone does not imply contact; only explicit ATTACK, FIGHT_BACK,
RESCUE or BETRAY allows it, without unrelated moves or new outcomes.
In a PROMO, actorNames are speakers. The verified angle.targetPresence
field decides whether targetNames are merely MENTIONED or ON_SCREEN.
If MENTIONED (or unrecorded legacy presence), the named target must NOT
enter, respond, gesture, attack, sell or deliver a move. If ON_SCREEN,
they may appear as booked, but do not invent the outcome of a confrontation
or any additional uncast wrestler. Being named is not being present.
Do not invent signature physical traits, limps, scars, body language
defects or artificial "eyes shining" flourishes. Temporary selling in
an actual match is different from inventing a wrestler's character.
For interviews, celebrations, contract signings or video packages,
do not invent match moves, attackers, dialogue in quotes or combat.
A scripted BLOODIED appearance is not a medical injury. An intent
to build a rivalry does not prove heat increased. Refusal or
interruption cannot be narrated as the planned outcome happening.
No unexplained outsider, weapon or new participant.

Only a slot's supplied storyThread can establish HISTORY; at most
one relevant callback, never a new feud, feud payoff or invented
earlier confrontation. previousSharedMatch does NOT prove a rivalry.
An earlier same-card scene does not prove retaliation. No false
promises, backstage conversations or changes of allegiance.

Use wrestling terms naturally. Never expose star ratings, mechanics,
technical booking labels or equations. Avoid unsupported gender assumptions.
No extra prose or markdown outside the response JSON. Required keys
are card_0, card_1 etc (every card_N key once), headline and recap only.
Do not emit slotId fields: the server restores immutable official IDs.
Divide a recap with a double newline only when helpful.
`;
