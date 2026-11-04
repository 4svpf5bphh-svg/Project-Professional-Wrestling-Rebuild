/** Pre-save creative-contract warning, not a consent decision.
 * The authoritative saved-card reviews, standing agreements and requests
 * remain server-side.
 */
import type {EditorMatch} from "./card-editor-model.js";
export interface CreativeTermPreview{
 personId:string;name:string;kind:"APPROVAL"|"PROTECTION"|"CONSULTATION";
 message:string;
}
export function previewMatchCreativeTerms(match:EditorMatch,
 roster:ReadonlyMap<string,{name?:string|null;creativeControl?:string|null}>):CreativeTermPreview[]{
 const clean=["CLEAN_PIN","SUBMISSION"].includes(match.plannedFinish);
 const seen=new Set<string>(),notes:CreativeTermPreview[]=[];
 for(const [side,team] of match.teams.entries())for(const person of team){
  if(!person||seen.has(person.personId))continue;
  seen.add(person.personId);
  const record=roster.get(person.personId);
  const name=record?.name??person.personId,right=record?.creativeControl;
  if(right==="FULL_APPROVAL")
   notes.push({personId:person.personId,name,kind:"APPROVAL",
    message:name+" holds match approval rights. Save the card to check whether "+
     "an exact or standing agreement covers this script; approval is not assumed."});
  else if(clean&&side!==match.winnerSide&&right==="PROTECTED_FINISHES")
   notes.push({personId:person.personId,name,kind:"PROTECTION",
    message:name+"'s contract protects against this planned clean loss. "+
     "A different finish or their agreement may be needed after saving."});
  else if(clean&&side!==match.winnerSide&&right==="CONSULTATION")
   notes.push({personId:person.personId,name,kind:"CONSULTATION",
    message:name+" should be consulted about this planned clean loss. "+
     "Consultation does not guarantee agreement."});
 }
 return notes;
}
