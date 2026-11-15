import type { BookedAppearance } from "../domain/appearance-policy.js";
import {readBookedInterference} from "../simulation/legacy/match-interference.js";

export interface CardParticipant { personId:string; contractId:string }
export interface CardSlotPayload { participants:CardParticipant[] }

/** A strict first-version slot contract. Match and segment participant roles
 * will be extended with typed schemas; no arbitrary JSON traversal.
 */
export function readCardParticipants(payload:unknown):CardParticipant[] {
  if (!payload || typeof payload!=="object" || Array.isArray(payload)) throw new Error("Invalid card slot");
  const participants=(payload as Record<string,unknown>).participants;
  if (!Array.isArray(participants)) throw new Error("Card slot missing participants");
  if (participants.length>30) throw new Error("Too many slot participants");
  return participants.map(p=>{
    if (!p || typeof p!=="object" || Array.isArray(p)) throw new Error("Invalid participant");
    const record=p as Record<string,unknown>;
    if (typeof record.personId!=="string"||!record.personId||
        typeof record.contractId!=="string"||!record.contractId) throw new Error("Invalid participant contract");
    return {personId:record.personId,contractId:record.contractId};
  });
}

/** Subjects can be mentioned without working the show. */
export function liveSlotParticipants(payload:unknown):CardParticipant[]{
 const cast=readCardParticipants(payload);
 const scene=payload as {kind?:unknown;targetPresence?:unknown;targetIds?:unknown};
 if(!["PROMO","INTERVIEW","CHALLENGE"].includes(String(scene.kind))||
  scene.targetPresence==="ON_SCREEN"||!Array.isArray(scene.targetIds))return cast;
 const mentioned=new Set(scene.targetIds.filter((id):id is string=>typeof id==="string"));
 return cast.filter(p=>!mentioned.has(p.personId));
}
export function appearancesFromSlots(payloads:readonly unknown[]):BookedAppearance[] {
  if(payloads.length>100) throw new Error("Too many card slots");
  // Ringside run-ins need a contracted appearance without becoming competitors.
  // Old historical interference without an agreement stays readable.
  return payloads.flatMap(payload=>{
    const cast=liveSlotParticipants(payload),spot=readBookedInterference(payload);
    // Pre-recorded video does not require an in-person appearance or use a date.
    if((payload as Record<string,unknown>).kind==="VIDEO_PACKAGE")return [];
    return spot?.contractId?[...cast,{
      personId:spot.personId,contractId:spot.contractId
    }]:cast;
  });
}
