/** Readable preflight for the booker's working card.
 * It is not the authoritative save/World Lock check, which runs on the server.
 */
import {buildBookedMatch,type EditorMatch} from "./card-editor-model.js";
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
 try{buildBookedMatch(match);}
 catch(e){return {complete:false,label:"CHECK MATCH PLAN",
  hint:e instanceof Error?e.message:"Review the selected match format and finish."};}
 return {complete:true,label:"READY",
  hint:"All positions and finish choices are valid. Save to confirm contracts, divisions and title rules."};
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
 if(["INTERRUPTION","RESCUE","POST_MATCH_ASSAULT"].includes(angle.kind)&&
  (targets!==1||actors!==rules.maxActors||!angle.creativeBeat))
  return {complete:false,label:"FINISH THE SCENE",
   hint:"Choose the complete cast and how the confrontation ends."};
 if(angle.kind==="POST_MATCH_ASSAULT"&&!angle.sourceMatchSlotId)
  return {complete:false,label:"CHOOSE THE BOUT",
   hint:"Link the assault to an earlier match on this card."};
 if(["STABLE_INVITATION","STABLE_EXIT","STABLE_RECONCILIATION"].includes(angle.kind)
  &&!angle.stableId)return {complete:false,label:"CHOOSE FACTION",
  hint:"Select the faction involved in this story."};
 if(["STABLE_INVITATION","STABLE_RECONCILIATION"].includes(angle.kind)
  &&!angle.stableDecision)return {complete:false,label:"CHOOSE REACTION",
  hint:"Decide how the invited or returning wrestler responds."};
 if(angle.kind==="TURN"&&!angle.turnTargetAlignment)
  return {complete:false,label:"CHOOSE ALLEGIANCE",hint:"Set the wrestler's new alignment."};
 return {complete:true,label:"READY TO BOOK",
  hint:"The roles are filled. Save the card to validate contracts and storyline eligibility."};
}

/** Booking eligibility depends on the part being cast. Wrestlers may work a
 * match AND a storyline scene; only duplicate match entries, a wrestler
 * interfering in their own bout, or double-casting within a scene are blocked.
 * Contract and appearance permissions remain server-authoritative.
 */
export function reservedPickerPeople(
 role:"actors"|"targets"|"RUN_IN"|undefined,
 allMatchIds:readonly string[],
 currentBoutIds:readonly string[],
 currentSceneIds:readonly string[],
):ReadonlySet<string>{
 return new Set(role==="RUN_IN"?currentBoutIds:
  role==="actors"||role==="targets"?currentSceneIds:allMatchIds);
}
