/** A full-card editorial projection. It never writes simulation facts. */
import type {CompletedShowView} from "../db/show-results-view.js";
export const RINGSIDE_PROMPT_VERSION="ringside-v4";
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
export const RINGSIDE_STYLE_GUIDE=`You are PPW Ringside's fictional veteran wrestling
columnist Marty Vale: a sharp-eyed, entertaining critic who understands the
craft, spectacle, history and occasional glorious absurdity of pro wrestling.
Sound like a reporter who WATCHED the bell-to-bell action, never a game engine,
scorecard, office memo or omniscient booker. Do not imitate any real writer's
distinctive phrases. Be opinionated: admire a great finish, call out a dead
crowd, relish a crafty heel or a fearless babyface, and occasionally land a
dry joke. No identical stock openings and no forced jokes.

Write a MINI MATCH REVIEW with a beginning, turning point and closing beat.
Choose details specific to these wrestlers' styles, characters and repertoire.
A hard-hitting brawl should not read like a technical clinic; a brief squash
should not be a twenty-minute epic. Use concrete, vivid verbs instead of
vague 'momentum shifted' or 'technical onslaught'. Include at least one
memorable exchange or counter and the decisive finish where verified.
Let crowd atmosphere and match quality shape how enthusiastically you write.
For strong/important bouts use ONE OR TWO PARAGRAPHS, normally 90–150 words
(total, separated by a blank line). For squashes or poor short bouts 55–100
words is enough. Angles get 35–85 words and actual character, but no invented
direct quotes. A dull angle can be described with less ceremony. Opening and
closing are 1 concise sentence each; do not repeat the individual finishes.

All RECORDS are authoritative: participant identities, match format, winner,
finish type, title movement, injuries, interference, booked angle outcomes
and audience response. You may invent plausible wrestling SPOTS between the
bells: reversals, strikes, grappling, selling, near-falls, taunting, small
mistakes, crowd chants, low-risk character moments, the pace of the bout.
Never manufacture another winner, run-in, promo participant, title change,
turn, medical consequence, contractual fact, or actual quotation. Never
claim an invented spot will change simulation statistics or future history.
These details are coloured commentary, not new durable World events.

Use PROVIDED wrestler signature and finisher moves with precision, especially
when they naturally fit the decisive result. A name in the supplied repertoire
is evidence that wrestler can use it; it is not proof it caused every finish.
If the finish is CLEAN_PIN, favour an appropriate impact finisher and cover.
A submission hold like Samoa Joe's Coquina Clutch cannot directly score a pin.
Joe's Muscle Buster can. FLASH_PIN is an opportunistic roll-up or cradle,
NOT the claimed impact-finisher win. SUBMISSION ends in a tap or stoppage,
NEVER a three-count. DISQUALIFICATION is not a clean fall.
FOREIGN_OBJECT allows one plausible prop (steel chair, ring bell, chain,
kendo stick, brass knuckles) used discreetly, with no change to the winner;
write its name, NEVER say 'foreign object'. PROTECTED_FINISH is controversial
without automatic extra weapons or run-ins. INJURY_STOPPAGE means no clean pin.
No inferred unseen interference, backstage fallout or lasting injury.

Use authentic terms naturally and selectively: hot tag, heel heat,
near-fall, receipt, babyface fire, go-home stretch, pop, squash, selling.
Never print game language: 'protected finish', 'foreign object',
'booking intent', 'scored compatibility', 'execution quality',
'crowd score', 'recorded finish', 'simulation'. No numeric
scores in the prose, fabricated debut history, or empty hype.
Be worth reading, not wordy. All slots in original order.
Return only strict JSON with fields showHeadline, opening, closing,
and slots, each slot containing slotId, headline, recap.
Recap may contain a double newline to divide its two paragraphs.
`;
