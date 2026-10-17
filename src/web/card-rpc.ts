import type {WorldApiContext} from "../api/world-service.js";
import {stableChoicesAsActor,stableWorkspaceAsActor,createStableAsActor,addStableMemberAsActor,
 removeStableMemberAsActor,disbandStableAsActor,
 programmeWorkspaceAsActor,startProgrammeAsActor,endProgrammeAsActor,
 completedShowAsActor,showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor,markPreparedShowReadyAsActor} from "../api/world-service.js";

/** Framework-independent authenticated RPC router. Caller must verify the session,
 * origin, CSRF and request size before invoking. Browser-supplied actor IDs are ignored.
 */
export async function dispatchCardRpc(context:WorldApiContext,method:string,input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new Error("Invalid booking request");
 const p=input as Record<string,unknown>;
 const id=(name:string)=>{const x=p[name];if(typeof x!=="string"||!x||x.length>200)throw new Error("Invalid "+name);return x;};
 const worldId=id("worldId"),promotionId=id("promotionId"),showId=id("showId");
 if(method==="programmes")return programmeWorkspaceAsActor(context,worldId,promotionId);
 if(method==="stables")return stableWorkspaceAsActor(context,worldId,promotionId);
 if(method==="stableChoices")return stableChoicesAsActor(context,worldId,promotionId);
 if(method==="results")return completedShowAsActor(context,worldId,promotionId,showId);
 if(method==="load")return showCardEditorAsActor(context,worldId,promotionId,showId);
 if(method==="talent"){
  const search=p.search??"";
  if(typeof search!=="string")throw new Error("Invalid search");
  const cursor=p.cursor??null;
  if(cursor!==null&&(typeof cursor!=="object"||Array.isArray(cursor)||
   !["name","personId","contractId"].every(k=>typeof (cursor as Record<string,unknown>)[k]==="string")))
   throw new Error("Invalid cursor");
  return cardTalentAsActor(context,worldId,promotionId,showId,search,
   cursor as {name:string;personId:string;contractId:string}|null);
 }
 const requestId=id("requestId"),expectedRevision=p.expectedRevision;
 if(typeof expectedRevision!=="number"||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
  throw new Error("Invalid revision");
 if(method==="createStable"){
  if(typeof p.name!=="string"||!Array.isArray(p.personIds)||
   p.personIds.some(x=>typeof x!=="string"))
   throw new Error("Invalid stable founders");
  return createStableAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,name:p.name,personIds:p.personIds as string[]});
 }
 if(method==="addStableMember"||method==="removeStableMember"){
  const input={worldId,promotionId,requestId,expectedRevision,
   stableId:id("stableId"),personId:id("personId")};
  return method==="addStableMember"?
   addStableMemberAsActor(context,input):removeStableMemberAsActor(context,input);
 }
 if(method==="disbandStable")return disbandStableAsActor(context,{
  worldId,promotionId,requestId,expectedRevision,stableId:id("stableId")});
 if(method==="startProgramme"){
  const check=(v:unknown):v is {kind:"PERSON"|"TEAM";refId:string}[]=>
   Array.isArray(v)&&v.length>0&&v.length<=2&&v.every(x=>
    x&&typeof x==="object"&&
    (x.kind==="PERSON"||x.kind==="TEAM")&&typeof x.refId==="string");
  if(!check(p.sideA)||!check(p.sideB)||!(
   p.championshipId===undefined||p.championshipId===null||
   typeof p.championshipId==="string"))
   throw new Error("Invalid programme sides");
  return startProgrammeAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,sideA:p.sideA,sideB:p.sideB,
   championshipId:p.championshipId as string|null|undefined});
 }
 if(method==="endProgramme")return endProgrammeAsActor(context,{
  worldId,promotionId,requestId,expectedRevision,programmeId:id("programmeId")});
 if(method==="save"){
  if(!Array.isArray(p.matches)||!Array.isArray(p.runningOrder)||
   (p.segments!==undefined&&!Array.isArray(p.segments)))
   throw new Error("Invalid booking card");
  return saveCardEditorAsActor(context,{worldId,promotionId,showId,requestId,
   expectedRevision,matches:p.matches,
   ...(p.segments===undefined?{}:{segments:p.segments as never[]}),
   runningOrder:p.runningOrder as string[]});
 }
 if(method==="ready")return markPreparedShowReadyAsActor(context,{
  worldId,promotionId,showId,requestId,expectedRevision,confirmReadyToRun:true});
 throw new Error("Unknown booking action");
}
