/** Pure, card-local checks. A post-match attack cannot refer to a different
 * promotion, a future bout, or somebody who never wrestled in that bout.
 * Recheck on every save and against the locked card at World resolution.
 */
import {readCardParticipants} from "./card-participants.js";
export interface LinkedSlot {slotId:string;payload:unknown}
export function validatePostMatchLinks(
 matches:readonly LinkedSlot[],segments:readonly LinkedSlot[],order:readonly string[],
):void{
 const positions=new Map(order.map((slotId,i)=>[slotId,i]));
 const matchMap=new Map(matches.map(m=>[m.slotId,m]));
 for(const angle of segments){
  if(!angle.payload||typeof angle.payload!=="object"||
   Array.isArray(angle.payload))throw new Error("Invalid linked angle");
  const payload=angle.payload as Record<string,unknown>;
  if(payload.kind!=="POST_MATCH_ASSAULT"){
   if(payload.sourceMatchSlotId!==undefined)
    throw new Error("Only post-match assaults may reference a bout");
   continue;
  }
  const ref=payload.sourceMatchSlotId;
  if(typeof ref!=="string"||!ref.trim()||ref.length>200)
   throw new Error("Choose the bout before booking the assault");
  const match=matchMap.get(ref);
  if(!match||positions.get(ref)===undefined||
   positions.get(angle.slotId)===undefined||
   positions.get(ref)!>=positions.get(angle.slotId)!)
   throw new Error("An assault must follow a match on the same card");
  const victim=(payload.targetIds as unknown);
  if(!Array.isArray(victim)||victim.length!==1||
   typeof victim[0]!=="string"||
   !readCardParticipants(match.payload).some(p=>p.personId===victim[0]))
   throw new Error("The attacked wrestler must have taken part in that match");
 }
}
