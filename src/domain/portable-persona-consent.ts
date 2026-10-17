/** PPW wrestler-owned gimmick negotiation, not booker-forced repackaging.
 * Fictional resistance uses established on-screen popularity and consent rights.
 * The single deterministic response is resolved by a World command; retries
 * cannot resample. No decision may override the human-authored match result.
 */
import {createHash} from "node:crypto";
import {NAMED_PERSONA_OWNERS} from "../content/gimmick-catalog.js";
export interface PersonaConsentInput{
 worldSeed:string;personId:string;realName:string;
 currentGimmickId:string;requestedGimmickId:string;
 popularity:number;recognition:number;morale:number;
 creativeControl:"NONE"|"CONSULTATION"|"PROTECTED_FINISHES"|"FULL_APPROVAL";
 weeksSinceChange:number;weekIndex:number;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
export function evaluatePersonaConsent(x:PersonaConsentInput){
 for(const n of [x.popularity,x.recognition,x.morale]){
  if(!Number.isFinite(n)||n<0||n>100)
   throw new Error("Missing wrestler consent profile");
 }
 if(!Number.isSafeInteger(x.weeksSinceChange)||x.weeksSinceChange<0||
  !Number.isSafeInteger(x.weekIndex)||x.weekIndex<0||
  !["NONE","CONSULTATION","PROTECTED_FINISHES","FULL_APPROVAL"].includes(x.creativeControl)||
  !x.worldSeed||!x.personId||!x.realName||!x.currentGimmickId||!x.requestedGimmickId)
  throw new Error("Invalid portable identity negotiation");
 if(x.currentGimmickId===x.requestedGimmickId)
  throw new Error("Wrestler already has that character");
 const characterOwner=NAMED_PERSONA_OWNERS[x.currentGimmickId];
 const deeplyPersonal=characterOwner?.toLowerCase()===x.realName.toLowerCase();
 const tenure=Math.min(14,Math.floor(x.weeksSinceChange/13));
 const rights=x.creativeControl==="FULL_APPROVAL"?19:
  x.creativeControl==="PROTECTED_FINISHES"?8:
  x.creativeControl==="CONSULTATION"?4:0;
 const willingness=clamp(75-x.popularity*.33-x.recognition*.24-
  tenure-(deeplyPersonal?24:0)-rights+(100-x.morale)*.18,5,90);
 const digest=createHash("sha256").update(JSON.stringify([
  x.worldSeed,x.personId,x.currentGimmickId,
  x.requestedGimmickId,x.weekIndex])).digest();
 const roll=digest.readUInt32BE(0)/4294967296*100;
 const accepted=roll<willingness;
 return {accepted,assessedResistance:Math.round((100-willingness)*10)/10,
  reason:accepted?"WRESTLER_CONSENTED":
   deeplyPersonal?"ICONIC_PERSONA_PROTECTED":
   x.creativeControl==="FULL_APPROVAL"?"CREATIVE_APPROVAL_WITHHELD":
   "WRESTLER_PREFERS_ESTABLISHED_CHARACTER"};
}
