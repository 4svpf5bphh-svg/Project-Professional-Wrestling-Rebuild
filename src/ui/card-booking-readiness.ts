/** Readable preflight for the booker's working card.
 * It is not the authoritative save/World Lock check, which runs on the server.
 */
import type {EditorMatch} from "./card-editor-model.js";
import type {EditorSegment} from "./card-segment-model.js";
import {SEGMENT_BOOKING_RULES} from "../domain/segment-booking.js";
export interface SlotReadiness{complete:boolean;label:string;hint:string}
export function matchCastingReadiness(match:EditorMatch):SlotReadiness{
 const total=match.teams.reduce((n,side)=>n+side.length,0);
 const booked=match.teams.reduce((n,side)=>n+
  side.filter(Boolean).length,0);
 if(booked<total)return {complete:false,label:"NEEDS TALENT",
  hint:"Choose "+(total-booked)+" more wrestler"+(total-booked===1?"":"s")+"."};
 if(new Set(match.teams.flat().map(p=>p?.personId)).size!==total)
  return {complete:false,label:"DUPLICATE WRESTLER",
   hint:"A match cannot include the same wrestler twice."};
 if(match.winnerSide<0||match.winnerSide>=match.teams.length)
  return {complete:false,label:"CHOOSE A WINNER",hint:"Select the side that goes over."};
 return {complete:true,label:"CAST COMPLETE",
  hint:"All wrestling positions are filled. Save to confirm contracts, divisions and title rules."};
}
export function angleCastingReadiness(angle:EditorSegment):SlotReadiness{
 const rules=SEGMENT_BOOKING_RULES[angle.kind];
 if(!rules)return {complete:false,label:"CHOOSE ANGLE",hint:"Choose a supported angle."};
 const actors=angle.actors.length,targets=angle.targets.length;
 if(actors<rules.minActors)
  return {complete:false,label:"NEEDS PERFORMER",
   hint:"Choose "+(rules.minActors-actors)+" more performer"+
    (rules.minActors-actors===1?"":"s")+"."};
 if(targets<rules.minTargets)
  return {complete:false,label:"NEEDS TARGET",
   hint:"Choose "+(rules.minTargets-targets)+" more target"+
    (rules.minTargets-targets===1?"":"s")+"."};
 if(actors>rules.maxActors||!rules.allowTargets&&targets>0)
  return {complete:false,label:"CHECK CAST",hint:"This angle has incompatible performer roles."};
 const all=[...angle.actors,...angle.targets].map(x=>x.personId);
 if(new Set(all).size!==all.length)
  return {complete:false,label:"DUPLICATE WRESTLER",hint:"Give every performer just one part in this angle."};
 if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(angle.kind)
  &&!angle.stableId)return {complete:false,label:"CHOOSE FACTION",
  hint:"Select the faction involved in this story."};
 if(["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(angle.kind)
  &&!angle.stableDecision)return {complete:false,label:"CHOOSE REACTION",
  hint:"Decide how the invited or returning wrestler responds."};
 if(angle.kind==="TURN"&&!angle.turnTargetAlignment)
  return {complete:false,label:"CHOOSE ALLEGIANCE",hint:"Set the wrestler's new alignment."};
 return {complete:true,label:"CAST COMPLETE",
  hint:"The roles are filled. Save the card to validate contracts and storyline eligibility."};
}
