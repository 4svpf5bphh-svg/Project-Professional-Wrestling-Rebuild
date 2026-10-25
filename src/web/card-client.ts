import {bookingErrorMessage,deskErrorMessage,cardActionDomain,actionStatusMessage} from "./card-error-feedback.js";
/** Browser transport for the authenticated PPW booking and results surface.
 * The hosting app supplies a CSRF token from the verified session.
 * Neither the actor identity nor World state comes from browser payloads.
 */
export interface CardSessionScope {
 worldId:string;promotionId:string;showId:string;csrfToken:string;
}
export function createCardClient(scope:CardSessionScope,
 transport:typeof fetch=fetch){
 if(!scope||!["worldId","promotionId","csrfToken"].every(k=>{
  const value=scope[k as keyof CardSessionScope];
  return typeof value==="string"&&value.trim().length>0&&value.length<=200;
 }))throw new Error("Authenticated booking session required");
 const {worldId,promotionId,showId,csrfToken}=scope;
 if(typeof showId!=="string"||showId.length>200)
  throw new Error("Invalid optional booking draft");
 return async function call(method:string,extra:Record<string,unknown>={}){
  if(!["overview","dismissAttention","dismissAttentionBatch","load","talent","save","ready","creativeConsent","results","programmes","startProgramme","endProgramme","chooseProgrammeDirection","standingProgrammeConsent","stables","createStable",
   "addStableMember","removeStableMember","disbandStable","stableChoices",
   "workingConnections","persona","requestPersona","backstage","markBackstageRead",
   "backstageArchive","backstageDecision","resultsArchive",
   "championships","championshipHistory","tagTeams","createTagTeam","renameTagTeam",
   "planner","planShow","calendar","saveCalendar","archiveCalendar","contracts","wrestlerDirectory","wrestlerProfile","wrestlerCareer","saveWrestlerRepertoire","submitContractOffer","business","signCommercial","previewRestructure","restructurePromotion","staff","setStaffContinuity","setGorillaPolicy","gorillaWorkspace","saveGorillaShow","hireTalentManager","releaseTalentManager","hireStaff","releaseStaff","renewStaff","industry","industryNews","worldHeritage","legendsVault","legendSeen","worldMomentsOlder","kpWorkspace","kpClaimWeek","kpAction","industryFeatured","worldRankings","worldCareerSearch","promotionRecordBook","requestContractDates","cancelContractDates","renewContract",
   "withdrawContractRenewal","withdrawContractOffer"].includes(method))
   throw new Error("Unknown card action");
  if(["load","talent","save","ready","results"].includes(method)&&!showId)
   throw new Error("A booked show is required for this action");
  let response:Response;
  try{response=await transport("/api/card",{
   method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json","x-ppw-csrf":csrfToken},
   body:JSON.stringify({...extra,worldId,promotionId,showId,method}),
  });}catch{throw new Error("Network unavailable. Check your connection and retry this action.");}
  if(response.status===401&&typeof window!=="undefined")
   window.dispatchEvent(new Event("ppw:session-lost"));
  if(!response.ok){
   let correction:string|null=null;
   let reference="";
   if(response.status===400){
    try{
     const rejected:unknown=await response.json();
     if(rejected&&typeof rejected==="object"&&!Array.isArray(rejected)){
      const record=rejected as Record<string,unknown>;
      correction=cardActionDomain(method)==="booking"?
       bookingErrorMessage(record.code):deskErrorMessage(record.code);
      if(typeof record.reference==="string"&&/^[a-f0-9]{12}$/.test(record.reference))
       reference=" Support reference: "+record.reference+".";
     }
    }catch{ /* Proxy and malformed errors must not leak sensitive response bodies. */ }
   }
   throw new Error((correction??actionStatusMessage(method,response.status))+reference);
  }
  return response.json();
 };
}
