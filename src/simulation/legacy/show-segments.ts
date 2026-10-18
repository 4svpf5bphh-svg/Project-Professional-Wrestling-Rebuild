/** Author-owned segment outcome contract. Scoring and durable resolution are
 * deliberately separate: simulation must not choose a scripted outcome.
 */
import {isSegmentCreativeBeat,type SegmentCreativeBeat} from "../../domain/segment-creative-beats.js";
export type SegmentKind="PROMO"|"INTERVIEW"|"CONFRONTATION"|"CHALLENGE"|"CELEBRATION"|"ATTACK"|"TURN"|"CONTRACT_SIGNING"|"INTERFERENCE"|
 "DEBUT"|"VIDEO_PACKAGE"|"STABLE_INVITATION"|"STABLE_EXIT"|"STABLE_RECONCILIATION";
export type VideoPurpose="DEBUT_HYPE"|"RETURN_HYPE"|"WRESTLER_HYPE"|
 "FEUD_RECAP"|"EVENT_PROMO";
export type SegmentOutcome="HAPPENS"|"REFUSED"|"INTERRUPTED";
export interface AuthoredSegment {
 slotId:string;position:number;kind:SegmentKind;
 actorIds:readonly string[];targetIds:readonly string[];
 outcome:SegmentOutcome;
 videoPurpose?:VideoPurpose;
 /** Absent on historical generic angles; no unscripted response is fabricated. */
 creativeBeat?:SegmentCreativeBeat;
 /** Optional for historical turns. New authored turns may choose a definite alignment. */
 turnTargetAlignment?:"FACE"|"HEEL"|"TWEENER";
 /** Promotion-owned faction for a player-authored stable story. Never mutates membership. */
 stableId?:string;
 /** Explicit scripted answer; invitation happening does not imply accepting. */
 stableDecision?:"ACCEPTED"|"REJECTED";
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
     "VIDEO_PACKAGE","STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(s.kind)||
   !["HAPPENS","REFUSED","INTERRUPTED"].includes(s.outcome)||
   !Array.isArray(s.actorIds)||!Array.isArray(s.targetIds)||
   s.actorIds.length>20||s.targetIds.length>20||
   ![...s.actorIds,...s.targetIds].every(id=>knownPeople.has(id))||
   new Set(s.actorIds).size!==s.actorIds.length||
   new Set(s.targetIds).size!==s.targetIds.length||
   s.actorIds.some(id=>s.targetIds.includes(id))||
   (s.creativeBeat!==undefined&&!isSegmentCreativeBeat(s.creativeBeat,s.kind))||
   (s.stableDecision!==undefined&&(
    !["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(s.kind)||
    !["ACCEPTED","REJECTED"].includes(s.stableDecision)))||
   (s.stableId!==undefined&&(
    !["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(s.kind)||
    typeof s.stableId!=="string"||!s.stableId.trim()||s.stableId.length>200))||
   (s.turnTargetAlignment!==undefined&&
    (s.kind!=="TURN"||!["FACE","HEEL","TWEENER"].includes(s.turnTargetAlignment)))||
   (s.kind==="VIDEO_PACKAGE")!==Boolean(s.videoPurpose)||
   (s.videoPurpose!==undefined&&
    !["DEBUT_HYPE","RETURN_HYPE","WRESTLER_HYPE","FEUD_RECAP",
      "EVENT_PROMO"].includes(s.videoPurpose))||
   (s.kind!=="VIDEO_PACKAGE"&&s.actorIds.length===0)||
   (["ATTACK","CONFRONTATION","CHALLENGE"].includes(s.kind)&&(s.actorIds.length===0||s.targetIds.length===0))||
   (s.kind==="INTERFERENCE"&&(s.actorIds.length===0||s.targetIds.length===0))||
   (s.kind==="TURN"&&s.actorIds.length!==1)||
   (s.kind==="DEBUT"&&s.actorIds.length!==1)||
   (["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(s.kind)&&s.targetIds.length===0))
   throw new Error("Invalid authored segment");
  slots.add(s.slotId);positions.add(s.position);
  return {...s,actorIds:[...s.actorIds],targetIds:[...s.targetIds]};
 });
}
