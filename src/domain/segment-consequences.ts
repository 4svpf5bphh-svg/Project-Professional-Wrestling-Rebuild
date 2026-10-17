import type {BookedSegmentPayload} from "./segment-booking.js";
import {normalizeBookedSegment} from "./segment-booking.js";
export type SegmentConsequenceIntent=
 "ATTACK_OCCURRED"|"TURN_OCCURRED"|"SIGNING_OCCURRED"|"INTERFERENCE_OCCURRED"|
 "DEBUT_OCCURRED"|"STABLE_EXIT_OCCURRED"|"RECONCILIATION_OCCURRED"|"VIDEO_AIRED";
export interface AuthoredConsequence{
 slotId:string;intent:SegmentConsequenceIntent;
 actorIds:readonly string[];targetIds:readonly string[];
}
/** Explicit event intents, not automatic roster/contract/stable mutations.
 * Consumers may apply only the effects supported by canonical World state.
 */
export function authoredConsequenceIntents(payload:BookedSegmentPayload):AuthoredConsequence[]{
 const s=normalizeBookedSegment(payload,new Set(payload.participants.map(p=>p.personId)));
 if(s.outcome!=="HAPPENS")return [];
 const intent:Record<typeof s.kind,SegmentConsequenceIntent>={
 ATTACK:"ATTACK_OCCURRED",TURN:"TURN_OCCURRED",
 CONTRACT_SIGNING:"SIGNING_OCCURRED",INTERFERENCE:"INTERFERENCE_OCCURRED",
 DEBUT:"DEBUT_OCCURRED",STABLE_EXIT:"STABLE_EXIT_OCCURRED",
 STABLE_RECONCILIATION:"RECONCILIATION_OCCURRED",VIDEO_PACKAGE:"VIDEO_AIRED"};
 return [{slotId:s.slotId,intent:intent[s.kind],
  actorIds:[...s.actorIds],targetIds:[...s.targetIds]}];
}
