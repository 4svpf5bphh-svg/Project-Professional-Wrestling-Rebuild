/** Author-owned segment outcome contract. Scoring and durable resolution are
 * deliberately separate: simulation must not choose a scripted outcome.
 */
export type SegmentKind="PROMO"|"INTERVIEW"|"CONFRONTATION"|"CHALLENGE"|"CELEBRATION"|"ATTACK"|"TURN"|"CONTRACT_SIGNING"|"INTERFERENCE"|
 "DEBUT"|"VIDEO_PACKAGE"|"STABLE_EXIT"|"STABLE_RECONCILIATION";
export type VideoPurpose="DEBUT_HYPE"|"RETURN_HYPE"|"WRESTLER_HYPE"|
 "FEUD_RECAP"|"EVENT_PROMO";
export type SegmentOutcome="HAPPENS"|"REFUSED"|"INTERRUPTED";
export interface AuthoredSegment {
 slotId:string;position:number;kind:SegmentKind;
 actorIds:readonly string[];targetIds:readonly string[];
 outcome:SegmentOutcome;
 videoPurpose?:VideoPurpose;
}
export function validateAuthoredSegments(
 segments:readonly AuthoredSegment[],
 knownPeople:ReadonlySet<string>,
):readonly AuthoredSegment[]{
 if(segments.length>100)throw new Error("Too many segments");
 const positions=new Set<number>(),slots=new Set<string>();
 return segments.map(s=>{
  if(!s.slotId||slots.has(s.slotId)||!Number.isSafeInteger(s.position)||
   s.position<0||positions.has(s.position)||
   !["PROMO","INTERVIEW","CONFRONTATION","CHALLENGE","CELEBRATION","ATTACK","TURN","CONTRACT_SIGNING","INTERFERENCE","DEBUT",
     "VIDEO_PACKAGE","STABLE_EXIT","STABLE_RECONCILIATION"].includes(s.kind)||
   !["HAPPENS","REFUSED","INTERRUPTED"].includes(s.outcome)||
   !Array.isArray(s.actorIds)||!Array.isArray(s.targetIds)||
   s.actorIds.length>20||s.targetIds.length>20||
   ![...s.actorIds,...s.targetIds].every(id=>knownPeople.has(id))||
   new Set(s.actorIds).size!==s.actorIds.length||
   new Set(s.targetIds).size!==s.targetIds.length||
   s.actorIds.some(id=>s.targetIds.includes(id))||
   (s.kind==="VIDEO_PACKAGE")!==Boolean(s.videoPurpose)||
   (s.videoPurpose!==undefined&&
    !["DEBUT_HYPE","RETURN_HYPE","WRESTLER_HYPE","FEUD_RECAP",
      "EVENT_PROMO"].includes(s.videoPurpose))||
   (s.kind!=="VIDEO_PACKAGE"&&s.actorIds.length===0)||
   (["ATTACK","CONFRONTATION","CHALLENGE"].includes(s.kind)&&(s.actorIds.length===0||s.targetIds.length===0))||
   (s.kind==="INTERFERENCE"&&(s.actorIds.length===0||s.targetIds.length===0))||
   (s.kind==="TURN"&&s.actorIds.length!==1)||
   (s.kind==="DEBUT"&&s.actorIds.length!==1)||
   (s.kind==="STABLE_RECONCILIATION"&&s.targetIds.length===0))
   throw new Error("Invalid authored segment");
  slots.add(s.slotId);positions.add(s.position);
  return {...s,actorIds:[...s.actorIds],targetIds:[...s.targetIds]};
 });
}
