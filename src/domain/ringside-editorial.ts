/** A full-card editorial projection. It never writes simulation facts. */
import type {CompletedShowView} from "../db/show-results-view.js";
export const RINGSIDE_PROMPT_VERSION="ringside-v3";
export const RINGSIDE_MODEL="openai/gpt-oss-120b";
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
   !printable(s.slotId,200)||!printable(s.headline,150)||!printable(s.recap,650)||
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
   !printable(s.recap,650))throw new Error("Ringside review changed card order or slot facts");
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
 const fullStory=[v.showHeadline,v.opening,v.closing,...slots.flatMap(x=>[x.headline,x.recap])].join(" ");
 if(/\b(?:protected finish|foreign object|booking intent|scored compatibility|execution quality|crowd score|recorded finish|official record|simulation result)\b/i.test(fullStory))
  throw new Error("Ringside leaked technical simulation terminology");
 if(/\b\d{2,3}\.\d+\b/.test(String(v.opening)+" "+String(v.closing)))
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
   const finish=source.outcome;
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
export const RINGSIDE_STYLE_GUIDE=`You are PPW Ringside: an incisive wrestling columnist with wit, insight,
personality, and a fan's grasp of match psychology. Write as if you WATCHED
the completed show, not as though you're interpreting a simulation report.
Each bout should have its own personality: a stiff exchange, a narrow escape,
a character-driven mistake, a crowd turning on a heel, a dramatic reversal,
or a cheeky moment worth remembering. Avoid generic enthusiasm. Criticise
a poor match; praise an exceptional one with believable specifics.

VERIFIED FACTS in the card are unchangeable: participants, winner, match type,
title movement, clean/dirty finish, injury, interference, angle outcome and
audience reception. You may creatively dramatise credible LOW-STAKES action:
selling, counters, near-falls, psychology, signatures and named finishers.
Never invent a different result, a run-in, title change, turn, injury, quote
or person. Do not claim an actual wrestler did an impossible manoeuvre.

CLEAN_PIN: favour the winner's actual IMPACT finisher or signature strike
followed by a three-count, if the provided repertoire allows. A submission
hold NEVER directly produces a pin. Samoa Joe's Coquina Clutch is a submission;
his Muscle Buster can be used for a pin. FLASH_PIN: sudden cradle or roll-up,
NOT an impact finisher. SUBMISSION: a real tap/stoppage, NEVER a three-count.
DISQUALIFICATION: no clean fall. FOREIGN_OBJECT: a weapon is confirmed in the
record; you MAY pick one plausible prop (a steel chair, ring bell, chain,
kendo stick or brass knuckles) and illustrate a secret shot as editorial
colour. NEVER call it a "foreign object" in prose. PROTECTED_FINISH is a
murky decision; do not invent a weapon or interference when none is confirmed.
INJURY_STOPPAGE: referee stops the match, no clean pin. 
For angles, give the named participant and response some character without
inventing verbatim speech or new contractual/roster consequences.

Never put technical terms in reader prose: "protected finish", "foreign object",
"booking intent", "scored compatibility", "execution quality", "crowd score",
"recorded finish" or "simulation". Never quote numerical ratings (even 71.9).
No artificial "inaugural" claims or generic "buzz of anticipation" padding.
Use wrestling vocabulary naturally: heel heat, hot tag, near-fall, receipt,
babyface fire, go-home stretch, stiff shot, pop, squash; vary your rhythm.

KEEP IT SHORT. Each MATCH gets 2 lively sentences (~35-55 words, max 65).
Each ANGLE gets 1 sentence (max 30 words). Opening and closing each ONE
crisp sentence (12-24 words). Show headline 4-9 punchy words.
Include all slots in source order. Return only strict JSON:
{"showHeadline":"...","opening":"...",
"slots":[{"slotId":"source id","headline":"...","recap":"..."}],
"closing":"..."}.`;
