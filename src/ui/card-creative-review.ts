/** Present only the server's consent records, never infer wrestler approval.
 * Unsaved edits mean the authoritative signature has not been rechecked.
 * This model neither grants permission nor changes player-authored outcomes.
 */
import type {CreativeConcern} from "../domain/match-creative-consent.js";
export interface SlotCreativeState{
 slotId:string;required:number;approved:number;declined:number;unanswered:number;
 consultation:number;coveredByProgramme:number;
 label:string;needsSavedReview:boolean;
}
export function creativeForSlot(slotId:string,
 concerns:readonly CreativeConcern[],unsaved:boolean):SlotCreativeState{
 const own=concerns.filter(x=>x.slotId===slotId);
 const actionable=own.filter(x=>x.requiresConsent);
 const approved=actionable.filter(x=>x.decision==="APPROVED").length;
 const declined=actionable.filter(x=>x.decision==="DECLINED").length;
 const unanswered=actionable.filter(x=>x.decision==="NOT_REQUESTED").length;
 const consultation=own.filter(x=>!x.requiresConsent).length;
 const coveredByProgramme=own.filter(x=>x.approvalSource==="STANDING_PROGRAMME").length;
 const label=unsaved&&own.length?"Recheck after saving":
  declined?declined+" declined":
  unanswered?unanswered+" agreement"+(unanswered===1?"":"s")+" needed":
  actionable.length? "Creative terms agreed":
  consultation?"Consultation only":"No approval required";
 return {slotId,required:actionable.length,approved,declined,unanswered,
  consultation,coveredByProgramme,label,needsSavedReview:unsaved&&own.length>0};
}
export function consentRebookingAdvice(concern:Pick<CreativeConcern,"reason"|"decision">,
 finish:string):string|null{
 if(concern.decision!=="DECLINED")return null;
 if(concern.reason==="PROTECTED_LOSS"&&["CLEAN_PIN","SUBMISSION"].includes(finish))
  return "Their contract protects them from this clean loss. You may explicitly choose a different finish, change who wins, or postpone the match. Nothing changes automatically.";
 return "This wrestler has declined this specific booking. Edit the participants, scripted finish or match plan before requesting a new answer. The previous decision cannot be overridden.";
}
