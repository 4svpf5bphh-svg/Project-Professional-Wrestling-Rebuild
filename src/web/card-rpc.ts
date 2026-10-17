import type {WorldApiContext} from "../api/world-service.js";
import {contractDeskAsActor,requestAdditionalDatesAsActor,cancelDateRequestAsActor,
 proposeRenewalAsActor,withdrawRenewalAsActor,withdrawContractOfferAsActor,
 portablePersonaAsActor,requestPersonaAsActor,backstageDecisionAsActor,markBackstageReadAsActor,backstageArchiveAsActor,
 tagTeamWorkspaceAsActor,createTagTeamAsActor,nameTagTeamAsActor,
 workingConnectionsAsActor,stableChoicesAsActor,stableWorkspaceAsActor,createStableAsActor,addStableMemberAsActor,
 removeStableMemberAsActor,disbandStableAsActor,
 programmeWorkspaceAsActor,startProgrammeAsActor,endProgrammeAsActor,
 completedShowAsActor,completedShowArchiveAsActor,championshipsAsActor,championshipHistoryAsActor,showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor,markPreparedShowReadyAsActor} from "../api/world-service.js";

/** Framework-independent authenticated RPC router. Caller must verify the session,
 * origin, CSRF and request size before invoking. Browser-supplied actor IDs are ignored.
 */
export async function dispatchCardRpc(context:WorldApiContext,method:string,input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new Error("Invalid booking request");
 const p=input as Record<string,unknown>;
 const id=(name:string)=>{const x=p[name];if(typeof x!=="string"||!x||x.length>200)throw new Error("Invalid "+name);return x;};
 const worldId=id("worldId"),promotionId=id("promotionId");
 const showId=method==="championships"||method==="championshipHistory"?"":id("showId");
 if(method==="championships")return championshipsAsActor(context,worldId,promotionId);
 if(method==="championshipHistory"){
  const cursor=p.cursor??null;
  if(cursor!==null&&(typeof cursor!=="object"||Array.isArray(cursor)||
   !Number.isSafeInteger((cursor as Record<string,unknown>).startWeekIndex)||
   typeof (cursor as Record<string,unknown>).reignId!=="string"))
   throw new Error("Invalid championship cursor");
  return championshipHistoryAsActor(context,worldId,promotionId,
   id("titlePromotionId"),id("championshipId"),
   cursor as {startWeekIndex:number;reignId:string}|null);
 }
 if(method==="contracts")return contractDeskAsActor(context,worldId,promotionId);
 if(method==="programmes")return programmeWorkspaceAsActor(context,worldId,promotionId);
 if(method==="stables")return stableWorkspaceAsActor(context,worldId,promotionId);
 if(method==="tagTeams")return tagTeamWorkspaceAsActor(context,worldId,promotionId);
 if(method==="persona"||method==="backstage"){
  if(p.personId!==undefined&&typeof p.personId!=="string")
   throw new Error("Invalid wrestler");
  return portablePersonaAsActor(context,worldId,promotionId,
   p.personId as string|undefined);
 }
 if(method==="markBackstageRead")return markBackstageReadAsActor(context,
  worldId,promotionId,id("personId"));
 if(method==="backstageArchive"){
  if(typeof p.archived!=="boolean")throw new Error("Invalid archive choice");
  return backstageArchiveAsActor(context,{worldId,promotionId,
   personId:id("personId"),archived:p.archived});
 }
 if(method==="workingConnections"){
  const personId=p.personId;
  if(personId!==undefined&&typeof personId!=="string")
   throw new Error("Invalid wrestler");
  return workingConnectionsAsActor(context,worldId,promotionId,personId);
 }
 if(method==="stableChoices")return stableChoicesAsActor(context,worldId,promotionId);
 if(method==="results")return completedShowAsActor(context,worldId,promotionId,showId);
 if(method==="resultsArchive"){
  const cursor=p.cursor??null;
  if(cursor!==null&&(typeof cursor!=="object"||Array.isArray(cursor)||
   typeof (cursor as Record<string,unknown>).showId!=="string"||
   !Number.isSafeInteger((cursor as Record<string,unknown>).year)||
   !Number.isSafeInteger((cursor as Record<string,unknown>).week)))
   throw new Error("Invalid results cursor");
  return completedShowArchiveAsActor(context,worldId,promotionId,
   cursor as {year:number;week:number;showId:string}|null);
 }
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
 if(method==="requestContractDates"){
  if(!Number.isSafeInteger(p.additionalDates)||typeof p.additionalDates!=="number"||
    !Number.isSafeInteger(p.additionalPayment??0)||typeof (p.additionalPayment??0)!=="number")
   throw new Error("Invalid additional-dates proposal");
  return requestAdditionalDatesAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,contractId:id("contractId"),additionalDates:p.additionalDates,
   additionalPayment:(p.additionalPayment??0) as number});
 }
 if(method==="cancelContractDates")
  return cancelDateRequestAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,dateRequestId:id("dateRequestId")});
 if(method==="renewContract")
  return proposeRenewalAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,contractId:id("contractId")});
 if(method==="withdrawContractRenewal")
  return withdrawRenewalAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,proposalId:id("proposalId")});
 if(method==="withdrawContractOffer")
  return withdrawContractOfferAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,offerId:id("offerId")});
 if(method==="backstageDecision"){
  const choices=["TALK","DECLINE","PROMISE_APPEARANCE","PROMISE_SEGMENT","PROMISE_FEATURED","CONSIDER_REPACKAGE","KEEP_CHARACTER","EXPLORE_TEAM","EXPLORE_RIVALRY","NOT_NOW","EXPLORE_RENEWAL","MEDIATE"] as const;
  if(!choices.some(choice=>choice===p.decision))
   throw new Error("Invalid Backstage decision");
  return backstageDecisionAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,conversationId:id("conversationId"),
   decision:p.decision as (typeof choices)[number]});
 }
 if(method==="requestPersona")return requestPersonaAsActor(context,{
  worldId,promotionId,requestId,expectedRevision,
  personId:id("personId"),gimmickId:id("gimmickId")});
 if(method==="renameTagTeam"){
  if(typeof p.name!=="string")throw new Error("Invalid tag team name");
  return nameTagTeamAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,name:p.name,teamId:id("teamId")});
 }
 if(method==="createTagTeam"){
  if(typeof p.name!=="string"||!Array.isArray(p.personIds)||
   p.personIds.some(x=>typeof x!=="string"))
   throw new Error("Invalid tag team pairing");
  return createTagTeamAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,name:p.name,personIds:p.personIds as string[]});
 }
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
