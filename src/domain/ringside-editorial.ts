/** A full-card editorial projection. It never writes simulation facts. */
import type {CompletedShowView} from "../db/show-results-view.js";
import type {RingsideMemory} from "../db/ringside-continuity.js";
import {verifiedSlotStoryThreads} from "./ringside-story-threads.js";
import {wrestlingMatchIQ,validateWrestlingMechanics} from "./wrestling-iq.js";
import {MATCH_STIPULATIONS,type MatchStipulation} from "./match-stipulations.js";
// Updated editorial is versioned independently. Published v4 remains immutable.
export const RINGSIDE_PROMPT_VERSION="ringside-v8";
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
  storyBeats:"Make the enclosure change the wrestling: cramped movement, a plausible brush or impact against the steel, then a weary closing stretch ending in the certified pin inside the cage. Do not claim escaping won."},
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
  if(!hadTitleChange&&/\b(?:new (?:world |tag |women's )?champion|captured the (?:world |tag |women's )?title|title (?:changed hands|switch(?:ed|es) hands)|(?:won|claimed) the championship)\b/i.test(prose))
   throw new Error("Invented championship change");
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
   if(["CLEAN_PIN","FLASH_PIN"].includes(finish)&&
    /\b(?:decisive|winning|match[- ]ending|finish(?:ing)?)\s+(?:submission|tap[- ]out)\b|\b(?:submission|tap[- ]out)\b[^.!?;]{0,75}\b(?:forc(?:e|ed|ing)|caus(?:e|ed|ing)|result(?:s|ed|ing)? in|produced?|deliver(?:s|ed|ing)?|sealed)\b[^.!?;]{0,35}\b(?:a\s+)?(?:clean\s+)?(?:pin(?:fall)?|three[- ]count)\b/i.test(prose))
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
   const finish:Record<string,string>={
    CLEAN_PIN:"secured a clean pinfall",FLASH_PIN:"snatched a sudden pinfall",
    SUBMISSION:"earned a submission victory",
    DISQUALIFICATION:"took the decision by disqualification",
    FOREIGN_OBJECT:"emerged victorious after a controversial ending",
    PROTECTED_FINISH:"prevailed after a contentious ending",
    INJURY_STOPPAGE:"prevailed when the match was stopped"};
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
const crowdMood=(n:number)=>n>=84?"electric":n>=70?"loud":n>=56?"engaged":
 n>=42?"divided":n>=28?"muted":"quiet";

/** Send relevant certified facts once, without redundant IDs and analytics. */
export function ringsideBrief(show:CompletedShowView,memory:RingsideMemory={priorMatches:[],programmes:[]}){
 const slotStories=verifiedSlotStoryThreads(show,memory);
 return {show:show.showName??"Weekly show",year:show.year,week:show.week,
  audienceMood:crowdMood(show.crowdResponse),
  slots:show.entries.map((e,i)=>({
   editorialLens:["ring psychology","shifting crowd allegiance","pacing and the finishing stretch",
    "the wrestlers\u0027 distinct personalities","wrestling spectacle"][
     (i+[...show.showId].reduce((sum,ch)=>sum+ch.charCodeAt(0),0))%5],
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
    titleContested:e.matchContext.championshipContested,
    ...(ringsideStipulationNote(e.matchContext.format)?{
     stipulationRules:ringsideStipulationNote(e.matchContext.format)}:{})}}:{}),
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
Have opinions: praise earned psychology, criticise flat spells, relish
a crafty heel or fiery babyface. Humour is occasional, dry and specific.
No borrowed real-world writer's phrases, repetitive stock hype, or fake
history. Every bout should sound different.

Write ONE chronological show article. The opening sets the atmosphere;
each slot advances the night without restarting it; closing gives a
distinct editorial judgement rather than re-listing winners.
For EVERY match: provide beginning, contrasting personalities and
styles, a believable shift or memorable exchange, then ONE decisive finish
near the end. A near-fall is not a second victory.
Give 90–150 words to strong matches (one or two paragraphs), 55–100 to
squashes; angle scenes 35–85. Short matches are not epic wars. Poor
matches should read poorly, not like five-star classics.
Avoid formulaic openings such as "In the end", "The crowd erupted",
"Fans were treated to" and constant "momentum shifted".
Use concrete ring action and a specific editorial verdict. Do not
repeat decisive moves, final falls, full sentences or openings across
multiple bouts. Reader sees a continuous card.

The slot records are AUTHORITATIVE: participant names, match format,
winner, winning method, title movement, injured wrestlers, interference,
angle outcomes and audience mood. Match.wrestlingIQ gives the legal
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

For normal singles, two legal opponents compete. No tags or tag partners.
For tag matches, only one wrestler PER TEAM is legal; a partner waits
on the apron and needs a legal tag to wrestle or score a fall. An earned
hot tag is optional, NOT mandatory; squashes may end without one.
Do not invent a precise fall scorer when only the winning team is
certified. Trios also tag. Multi-team formats need correct legal teams,
not an invented rotation or elimination rule. In triple threats and
four-ways there are NO tags: all individual competitors are legal.
Battle royals are about over-the-top-rope eliminations, not pinfalls.
Keep referee conduct consistent with the booked stipulation.

Finish discipline matters more than clever prose. CLEAN_PIN means
a legitimate cover and three-count. FLASH_PIN means a sudden roll-up
or cradle, not a giant impact finisher. SUBMISSION means tap-out or
referee stoppage, not pinfall. A submission finisher like Samoa Joe's
Coquina Clutch cannot score a pin; his Muscle Buster may lead to a
cover. A hold may set up an independent pin later, but never claim
the submission ITSELF forced a clean pin.
DISQUALIFICATION never becomes a clean pin. FOREIGN_OBJECT allows
a plausible discreet named prop, not a generic "foreign object";
PROTECTED_FINISH does not imply automatic weapons or outsiders.
INJURY_STOPPAGE is not a pin or submission.
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

Use wrestling terminology sparingly and accurately: heat, pop,
hot tag, near-fall, selling, go-home stretch, heel, babyface.
Never expose scores, star ratings, technical labels ("protected
finish", "booking intent", "recorded finish", "simulation"),
staff mechanics or ratings equations. No pronoun or gender
assumptions not supplied by identities.
No extra prose or markdown outside the response JSON. Required keys
are card_0, card_1 etc (every card_N key once), headline and recap only.
Do not emit slotId fields: the server restores immutable official IDs.
Divide a recap with a double newline only when helpful.
`;
