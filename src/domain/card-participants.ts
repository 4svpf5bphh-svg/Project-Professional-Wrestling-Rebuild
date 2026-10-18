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

export function appearancesFromSlots(payloads:readonly unknown[]):BookedAppearance[] {
  if(payloads.length>100) throw new Error("Too many card slots");
  // Ringside run-ins need a contracted appearance without becoming competitors.
  // Old historical interference without an agreement stays readable.
  return payloads.flatMap(payload=>{
    const cast=readCardParticipants(payload),spot=readBookedInterference(payload);
    return spot?.contractId?[...cast,{
      personId:spot.personId,contractId:spot.contractId
    }]:cast;
  });
}
