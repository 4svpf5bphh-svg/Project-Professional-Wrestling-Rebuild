/** Wrestler overness is the live crowd's connection, NOT fame or recent
 * form. Only actually completed on-screen matches/angles award progress.
 * A wrestler talked about in a promo cannot take credit for appearing.
 *
 * Show deltas are capped so one booker cannot farm a gimmick by adding twenty
 * nearly identical spots to the same card. No RNG, Groq or page-view work.
 */
export interface CertifiedOvernessMatch{
 slotId:string;personIds:readonly string[];
 crowdResponse:number;ratingStars:number;winnerIds?:readonly string[];
}
export interface CertifiedOvernessAngle{
 slotId:string;actorIds:readonly string[];targetIds:readonly string[];
 targetPresence?:"MENTIONED"|"ON_SCREEN";
 crowdResponse:number;ratingStars:number;
}
export interface EarnedOvernessChange{
 personId:string;overnessDelta:number;gimmickDelta:number;
}
const clamp=(v:number,low:number,high:number)=>Math.max(low,Math.min(high,v));
const round2=(v:number)=>Math.round(v*100)/100;
const validScore=(v:number,high:number)=>Number.isFinite(v)&&v>=0&&v<=high;
const validIds=(ids:readonly string[],limit:number)=>Array.isArray(ids)&&
 ids.length>0&&ids.length<=limit&&ids.every(s=>typeof s==="string"&&!!s.trim()&&s.length<=200)&&
 new Set(ids).size===ids.length;
export function deriveCertifiedOvernessChanges(
 matches:readonly CertifiedOvernessMatch[],
 angles:readonly CertifiedOvernessAngle[],
):EarnedOvernessChange[]{
 if(matches.length+angles.length>100)throw new Error("Overness card exceeds bounded size");
 const seen=new Set<string>();
 const totals=new Map<string,{overness:number;gimmick:number;appearances:number}>();
 const earn=(id:string,overness:number,gimmick:number)=>{
  const s=totals.get(id)??{overness:0,gimmick:0,appearances:0};
  s.overness+=overness;s.gimmick+=gimmick;s.appearances++;
  totals.set(id,s);
 };
 for(const m of matches){
  if(!m.slotId||seen.has(m.slotId)||!validIds(m.personIds,30)||
   !validScore(m.crowdResponse,100)||!validScore(m.ratingStars,5)||
   (m.winnerIds!==undefined&&(!validIds(m.winnerIds,30)||
    m.winnerIds.some(x=>!m.personIds.includes(x)))))
   throw new Error("Invalid certified overness match");
  seen.add(m.slotId);
  // Overness can rise in defeat. High-quality, crowd-connecting wrestling
  // matters more than the scripted result, and bad matches may cool an act.
  const contribution=clamp((m.crowdResponse-50)/30+
   (m.ratingStars-2.5)*0.25,-2,2.8);
  for(const id of m.personIds)
   earn(id,contribution+(m.winnerIds?.includes(id)?0.18:0),
    contribution*0.48);
 }
 for(const a of angles){
  if(!a.slotId||seen.has(a.slotId)||!validIds(a.actorIds,20)||
   !Array.isArray(a.targetIds)||a.targetIds.length>20||
   a.targetIds.some(x=>typeof x!=="string"||!x.trim()||x.length>200)||
   new Set([...a.actorIds,...a.targetIds]).size!==
    a.actorIds.length+a.targetIds.length||
   !validScore(a.crowdResponse,100)||!validScore(a.ratingStars,5)||
   (a.targetPresence!==undefined&&!["MENTIONED","ON_SCREEN"].includes(a.targetPresence)))
   throw new Error("Invalid certified overness angle");
  seen.add(a.slotId);
  const reaction=clamp((a.crowdResponse-50)/30+
   (a.ratingStars-2.5)*0.25,-2,2.8);
  for(const id of a.actorIds)earn(id,reaction,reaction*0.9);
  // Target presence is explicit for PROMO/INTERVIEW/CHALLENGE. Other
  // scripted physical angles have true on-screen targets by definition.
  if(a.targetPresence!=="MENTIONED")
   for(const id of a.targetIds)earn(id,reaction*0.55,reaction*0.4);
 }
 if(totals.size>400)throw new Error("Too many earned overness identities");
 return [...totals].sort(([a],[b])=>a.localeCompare(b)).map(([personId,s])=>{
  const damp=1+Math.max(0,s.appearances-1)*0.2;
  return {personId,
   overnessDelta:round2(clamp(s.overness/damp,-3,3.5)),
   gimmickDelta:round2(clamp(s.gimmick/damp,-3,3.5))};
 });
}
