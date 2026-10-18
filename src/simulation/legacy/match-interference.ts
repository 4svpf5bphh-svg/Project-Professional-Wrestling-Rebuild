/** Original PPW interference delivery rule from archived matches.ts.
 * Player scripts SUCCESS or THWARTED. An unavailable participant or actual
 * injury stoppage ABORTS the spot; nothing randomly changes the winner.
 * Pure after-medical preview; no permanent results or contract charges.
 */
import type {InjuryResolutionPreview} from "./match-injuries.js";
import type {MatchFinish} from "./match-finishes.js";

export interface BookedInterference {
  personId:string;
  contractId?:string;
  aidedSide:"A"|"B";
  plannedOutcome:"SUCCESS"|"THWARTED";
}
export interface InterfererReadiness {
  active:boolean;
  appearanceCommitted:boolean;
  /** Unknown historical presentation must NOT be guessed for a valid spot. */
  presentation:number|null;
}
export interface InterferenceResolutionPreview {
  stage:"POST_INTERFERENCE_PRE_SHOW_FLOW";
  plannedWinnerId:string;
  actualWinnerId:string;
  plannedFinish:MatchFinish;
  actualFinish:MatchFinish;
  injuryStoppage:boolean;
  crowdResponse:number;
  interference:{
    personId:string;aidedSide:"A"|"B";
    plannedOutcome:"SUCCESS"|"THWARTED";
    outcome:"SUCCESS"|"THWARTED"|"ABORTED";
    delivery:number;
    abortReason:"INJURY_STOPPAGE"|"INTERFERER_UNAVAILABLE"|null;
  }|null;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function readBookedInterference(payload:unknown):BookedInterference|null {
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw new Error("Invalid match interference payload");
  const raw=(payload as Record<string,unknown>).interference;
  if(raw===undefined||raw===null)return null;
  if(!raw||typeof raw!=="object"||Array.isArray(raw))
    throw new Error("Invalid booked interference");
  const x=raw as Record<string,unknown>;
  if(typeof x.personId!=="string"||!x.personId||x.personId.length>200||
     (x.contractId!==undefined&&
      (typeof x.contractId!=="string"||!x.contractId||x.contractId.length>200))||
     (x.aidedSide!=="A"&&x.aidedSide!=="B")||
     (x.plannedOutcome!=="SUCCESS"&&x.plannedOutcome!=="THWARTED"))
    throw new Error("Invalid booked interference");
  return {personId:x.personId,
    ...(typeof x.contractId==="string"?{contractId:x.contractId}:{}),
    aidedSide:x.aidedSide,plannedOutcome:x.plannedOutcome};
}

/** Pure original interference logic after medical injury resolution.
 * An "ABORTED" action never changes the finish, even if the booked plan
 * said it would succeed. Medical stoppage always takes precedence.
 */
export function previewArchivedInterference(
  injury:InjuryResolutionPreview,
  booked:BookedInterference|null,
  interferer:InterfererReadiness|null,
):InterferenceResolutionPreview {
  if(!booked)return {
    stage:"POST_INTERFERENCE_PRE_SHOW_FLOW",plannedWinnerId:injury.plannedWinnerId,
    actualWinnerId:injury.actualWinnerId,plannedFinish:injury.plannedFinish,
    actualFinish:injury.actualFinish,injuryStoppage:injury.injuryStoppage,
    crowdResponse:injury.crowdResponse,interference:null,
  };
  if(!booked.personId || (booked.aidedSide!=="A"&&booked.aidedSide!=="B")||
     (booked.plannedOutcome!=="SUCCESS"&&booked.plannedOutcome!=="THWARTED"))
    throw new Error("Invalid booked interference");
  const available=interferer?.active===true &&
    interferer.appearanceCommitted===true;
  if(available && (typeof interferer!.presentation!=="number"||
     !Number.isFinite(interferer!.presentation)||interferer!.presentation<0||
     interferer!.presentation>100))
    throw new Error("Missing interferer presentation score");
  const aborted=injury.actualFinish==="INJURY_STOPPAGE"||!available;
  const outcome=aborted?"ABORTED":booked.plannedOutcome;
  const delivery=interferer?.presentation===null||
    interferer?.presentation===undefined?0:
    clamp((interferer.presentation-50)*0.045,-2.25,2.25);
  const crowdResponse=Math.round(clamp(injury.crowdResponse+
    (outcome==="SUCCESS"?1.5:outcome==="THWARTED"?-0.5:-2)+
    (outcome==="ABORTED"?0:delivery),0,100)*10)/10;
  return {
    stage:"POST_INTERFERENCE_PRE_SHOW_FLOW",
    plannedWinnerId:injury.plannedWinnerId,actualWinnerId:injury.actualWinnerId,
    plannedFinish:injury.plannedFinish,
    actualFinish:outcome==="SUCCESS"?"PROTECTED_FINISH":injury.actualFinish,
    injuryStoppage:injury.injuryStoppage,crowdResponse,
    interference:{personId:booked.personId,aidedSide:booked.aidedSide,
      plannedOutcome:booked.plannedOutcome,outcome,delivery:outcome==="ABORTED"?0:delivery,
      abortReason:outcome==="ABORTED"?
        (injury.actualFinish==="INJURY_STOPPAGE"?"INJURY_STOPPAGE":"INTERFERER_UNAVAILABLE"):
        null},
  };
}
