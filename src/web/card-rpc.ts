import type {WorldApiContext} from "../api/world-service.js";
import {overviewAsActor,dismissAttentionAsActor,dismissAttentionBatchAsActor} from "../api/world-service.js";
import {calendarAsActor,upsertCalendarAsActor,archiveCalendarAsActor,
 plannerAsActor,planShowAsActor,contractDeskAsActor,wrestlerDirectoryAsActor,wrestlerProfileAsActor,wrestlerCareerAsActor,editWrestlerRepertoireAsActor,businessAsActor,
 previewRestructureAsActor,restructurePromotionAsActor,signCommercialDealAsActor,
 staffWorkspaceAsActor,promotionRecordBookAsActor,setStaffContinuityAsActor,setGorillaPolicyAsActor,gorillaWorkspaceAsActor,saveGorillaShowAsActor,hireTalentManagerAsActor,releaseTalentManagerAsActor,hireStaffAsActor,releaseStaffAsActor,renewStaffAsActor,industryWorldAsActor,industryFeaturedAsActor,industryNewsAsActor,worldHeritageAsActor,worldTalentRankingsAsActor,worldCareerSearchAsActor,
 submitContractOfferAsActor,requestAdditionalDatesAsActor,cancelDateRequestAsActor,
 proposeRenewalAsActor,withdrawRenewalAsActor,withdrawContractOfferAsActor,
 portablePersonaAsActor,requestPersonaAsActor,backstageDecisionAsActor,markBackstageReadAsActor,backstageArchiveAsActor,
 tagTeamWorkspaceAsActor,createTagTeamAsActor,nameTagTeamAsActor,
 workingConnectionsAsActor,stableChoicesAsActor,stableWorkspaceAsActor,createStableAsActor,addStableMemberAsActor,
 removeStableMemberAsActor,disbandStableAsActor,
 programmeWorkspaceAsActor,startProgrammeAsActor,endProgrammeAsActor,programmeDirectionAsActor,standingCreativeAgreementAsActor,
 completedShowAsActor,completedShowArchiveAsActor,championshipsAsActor,championshipHistoryAsActor,showCardEditorAsActor,cardTalentAsActor,saveCardEditorAsActor,requestMatchConsentAsActor,markPreparedShowReadyAsActor} from "../api/world-service.js";

/** Framework-independent authenticated RPC router. Caller must verify the session,
 * origin, CSRF and request size before invoking. Browser-supplied actor IDs are ignored.
 */
export async function dispatchCardRpc(context:WorldApiContext,method:string,input:unknown){
 if(!input||typeof input!=="object"||Array.isArray(input))
  throw new Error("Invalid booking request");
 const p=input as Record<string,unknown>;
 const id=(name:string)=>{const x=p[name];if(typeof x!=="string"||!x||x.length>200)throw new Error("Invalid "+name);return x;};
 const worldId=id("worldId"),promotionId=id("promotionId");
 const showId=["load","talent","save","ready","creativeConsent","results"].includes(method)?
  id("showId"):"";
 if(method==="overview")return overviewAsActor(context,worldId);
 if(method==="dismissAttention")return dismissAttentionAsActor(context,
  worldId,promotionId,id("attentionId"));
 if(method==="dismissAttentionBatch"){
  if(!Array.isArray(p.attentionIds)||p.attentionIds.length<1||
   p.attentionIds.length>10||p.attentionIds.some(x=>typeof x!=="string"))
   throw new Error("Invalid resolved updates");
  return dismissAttentionBatchAsActor(context,worldId,promotionId,p.attentionIds);
 }
 if(method==="planner")return plannerAsActor(context,worldId,promotionId);
 if(method==="calendar")return calendarAsActor(context,worldId,promotionId);
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
 if(method==="staff")return staffWorkspaceAsActor(context,worldId,promotionId);
 if(method==="gorillaWorkspace")return gorillaWorkspaceAsActor(context,worldId,promotionId);
 if(method==="industry")return industryWorldAsActor(context,worldId,promotionId);
 if(method==="industryNews")return industryNewsAsActor(context,worldId,promotionId);
 if(method==="worldHeritage")return worldHeritageAsActor(context,worldId,promotionId);
 if(method==="worldRankings")return worldTalentRankingsAsActor(context,worldId,promotionId);
 if(method==="worldCareerSearch"){
  if(typeof p.search!=="string")throw new Error("Invalid World career search");
  return worldCareerSearchAsActor(context,worldId,promotionId,p.search);
 }
 if(method==="promotionRecordBook")return promotionRecordBookAsActor(context,worldId,promotionId);
 if(method==="industryFeatured")return industryFeaturedAsActor(context,
  worldId,promotionId,id("targetPromotionId"));
 if(method==="business")return businessAsActor(context,worldId,promotionId);
 if(method==="previewRestructure")return previewRestructureAsActor(context,worldId,promotionId);
 if(method==="wrestlerDirectory"){
  const f=p.filter;
  if(!f||typeof f!=="object"||Array.isArray(f))
   throw new Error("Invalid directory filter");
  return wrestlerDirectoryAsActor(context,worldId,promotionId,
   f as import("../db/wrestler-directory.js").DirectoryFilter);
 }
 if(method==="wrestlerProfile")return wrestlerProfileAsActor(context,
  worldId,promotionId,id("personId"));
 if(method==="wrestlerCareer")return wrestlerCareerAsActor(context,
  worldId,promotionId,id("personId"));
 if(method==="programmes")return programmeWorkspaceAsActor(context,worldId,promotionId);
 if(method==="stables")return stableWorkspaceAsActor(context,worldId,promotionId);
 if(method==="tagTeams")return tagTeamWorkspaceAsActor(context,worldId,promotionId);
 if(method==="persona"||method==="backstage"){
  if(p.personId!==undefined&&typeof p.personId!=="string")
   throw new Error("Invalid wrestler");
  if(p.inboxOnly!==undefined&&typeof p.inboxOnly!=="boolean")
   throw new Error("Invalid inbox request");
  return portablePersonaAsActor(context,worldId,promotionId,
   p.personId as string|undefined,p.inboxOnly===true);
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
 if(method==="saveWrestlerRepertoire"){
  if(!Array.isArray(p.signatureMoves)||!Array.isArray(p.finishingMoves))
   throw new Error("Invalid wrestler move lists");
  if(p.primaryStyle!==null&&typeof p.primaryStyle!=="string"||
     p.secondaryStyle!==null&&typeof p.secondaryStyle!=="string")
   throw new Error("Invalid wrestler style");
  return editWrestlerRepertoireAsActor(context,{worldId,promotionId,
   personId:id("personId"),requestId,expectedRevision,
   primaryStyle:p.primaryStyle as string|null,
   secondaryStyle:p.secondaryStyle as string|null,
   signatureMoves:p.signatureMoves as string[],
   finishingMoves:p.finishingMoves as string[]});
 }
 if(method==="saveCalendar"){
  const series=p.series;
  if(!series||typeof series!=="object"||Array.isArray(series))
   throw new Error("Invalid calendar series");
  return upsertCalendarAsActor(context,{worldId,promotionId,requestId,expectedRevision,
   series:series as import("../domain/show-calendar.js").ShowSeries});
 }
 if(method==="archiveCalendar")
  return archiveCalendarAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,seriesId:id("seriesId")});
 if(method==="planShow"){
  if(!Number.isSafeInteger(p.year)||!Number.isSafeInteger(p.week)||
   !Number.isSafeInteger(p.day)||typeof p.ticketStrategy!=="string"||
   !["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"].includes(p.ticketStrategy)||
   typeof p.eventType!=="string"||
   !["REGULAR","MAJOR"].includes(p.eventType)||
   (p.draftId!==undefined&&typeof p.draftId!=="string")||
   (p.showSeriesId!==undefined&&(typeof p.showSeriesId!=="string"||
    p.showSeriesId.length===0||p.showSeriesId.length>200)))
   throw new Error("Invalid planner request");
  return planShowAsActor(context,{worldId,promotionId,requestId,expectedRevision,
   year:p.year as number,week:p.week as number,day:p.day as number,
   marketId:id("marketId"),venueId:id("venueId"),
   ticketStrategy:p.ticketStrategy as "ACCESSIBLE"|"STANDARD"|"PREMIUM"|"PRESTIGE",
   eventType:p.eventType as "REGULAR"|"MAJOR",
   ...(p.draftId===undefined?{}:{draftId:p.draftId as string}),
   ...(p.showSeriesId===undefined?{}:{showSeriesId:p.showSeriesId as string})});
 }
 if(method==="restructurePromotion")
  return restructurePromotionAsActor(context,{worldId,promotionId,requestId,expectedRevision});
 if(method==="signCommercial")
  return signCommercialDealAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,offerCode:id("offerCode")});
 if(method==="hireStaff"||method==="renewStaff"){
   const salary=p.weeklySalary,term=p.termWeeks;
   if(typeof salary!=="number"||!Number.isSafeInteger(salary)||
    (term!==52&&term!==104))throw new Error("Invalid staff contract terms");
   if(method==="hireStaff")return hireStaffAsActor(context,{worldId,promotionId,
    requestId,expectedRevision,staffId:id("staffId"),weeklySalary:salary,termWeeks:term});
   return renewStaffAsActor(context,{worldId,promotionId,requestId,
    expectedRevision,employmentId:id("employmentId"),weeklySalary:salary,termWeeks:term});
  }
  if(method==="releaseStaff")return releaseStaffAsActor(context,{
   worldId,promotionId,requestId,expectedRevision,employmentId:id("employmentId")});
  if(method==="hireTalentManager")return hireTalentManagerAsActor(context,{
  worldId,promotionId,requestId,expectedRevision,staffId:id("staffId")});
 if(method==="releaseTalentManager")return releaseTalentManagerAsActor(context,{
  worldId,promotionId,requestId,expectedRevision,employmentId:id("employmentId")});
 if(method==="saveGorillaShow"){
  if(!Array.isArray(p.matches)||p.matches.length>100||
   p.matches.some(x=>!x||typeof x!=="object"||Array.isArray(x)))
   throw new Error("Invalid Gorilla match decisions");
  return saveGorillaShowAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,showId:id("targetShowId"),
   matches:p.matches as unknown as import("../domain/gorilla-position.js").GorillaMatchInstruction[]});
 }
 if(method==="setGorillaPolicy"){
  if(!["STICK_TO_CARD","USE_JUDGEMENT","FOLLOW_THE_CROWD","PROTECT_KEY_PLANS"].includes(String(p.policy)))
   throw new Error("Invalid Gorilla policy");
  return setGorillaPolicyAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,policy:p.policy as import("../domain/gorilla-position.js").GorillaPolicy});
 }
 if(method==="setStaffContinuity"){
  const fallback=p.allowUnfinishedFallback,logistics=p.allowLogisticsFallback;
  const renew=p.autoRenewSameTerms;
  const days=p.permittedDays,venues=p.permittedVenueIds;
  if(typeof fallback!=="boolean"||typeof logistics!=="boolean"||
   (renew!==undefined&&typeof renew!=="boolean")||
   !Array.isArray(days)||days.some(x=>!Number.isSafeInteger(x))||
   !Array.isArray(venues)||venues.some(x=>typeof x!=="string"))
   throw new Error("Invalid staff delegation");
  return setStaffContinuityAsActor(context,{worldId,promotionId,
   requestId,expectedRevision,allowUnfinishedFallback:fallback,
   allowLogisticsFallback:logistics,autoRenewSameTerms:renew as boolean|undefined,
   permittedDays:days as number[],permittedVenueIds:venues as string[]});
 }
 if(method==="submitContractOffer"){
  const terms=p.terms;
  if(!terms||typeof terms!=="object"||Array.isArray(terms))
   throw new Error("Invalid contract offer");
  return submitContractOfferAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,personId:id("personId"),
   terms:terms as import("../domain/contract-economics.js").OfferTerms});
 }
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
 if(method==="standingProgrammeConsent"){
  if(!["SINGLES","TAG"].includes(String(p.matchType))||
   !["WIN_ONLY","WIN_OR_PROTECTED_LOSS"].includes(String(p.permittedOutcome))||
   !Number.isSafeInteger(p.termWeeks))
   throw new Error("Invalid rivalry agreement terms");
  return standingCreativeAgreementAsActor(context,{
   worldId,promotionId,requestId,expectedRevision,
   programmeId:id("programmeId"),personId:id("personId"),
   matchType:p.matchType as "SINGLES"|"TAG",
   permittedOutcome:p.permittedOutcome as "WIN_ONLY"|"WIN_OR_PROTECTED_LOSS",
   termWeeks:p.termWeeks as number
  });
 }
 if(method==="chooseProgrammeDirection"){
  if(!["PURSUE_REMATCH","PLAN_RETALIATION","LET_STAND"].includes(String(p.choice)))
   throw new Error("Invalid creative direction");
  return programmeDirectionAsActor(context,{worldId,promotionId,requestId,
   expectedRevision,programmeId:id("programmeId"),showId:id("sourceShowId"),
   slotId:id("sourceSlotId"),choice:p.choice as import("../db/programme-workspace.js").ProgrammeDirectionChoice});
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
 if(method==="creativeConsent")return requestMatchConsentAsActor(context,{
  worldId,promotionId,showId,requestId,expectedRevision,
  slotId:id("slotId"),personId:id("personId")});
 if(method==="ready")return markPreparedShowReadyAsActor(context,{
  worldId,promotionId,showId,requestId,expectedRevision,confirmReadyToRun:true});
 throw new Error("Unknown booking action");
}
