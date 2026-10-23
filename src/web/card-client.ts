import {bookingErrorMessage} from "./card-error-feedback.js";
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
   "planner","planShow","calendar","saveCalendar","archiveCalendar","contracts","wrestlerDirectory","wrestlerProfile","wrestlerCareer","saveWrestlerRepertoire","submitContractOffer","business","previewRestructure","restructurePromotion","staff","setStaffContinuity","hireTalentManager","releaseTalentManager","hireStaff","releaseStaff","renewStaff","industry","industryFeatured","requestContractDates","cancelContractDates","renewContract",
   "withdrawContractRenewal","withdrawContractOffer"].includes(method))
   throw new Error("Unknown card action");
  if(["load","talent","save","ready","results"].includes(method)&&!showId)
   throw new Error("A booked show is required for this action");
  const response=await transport("/api/card",{
   method:"POST",credentials:"same-origin",
   headers:{"content-type":"application/json","x-ppw-csrf":csrfToken},
   body:JSON.stringify({...extra,worldId,promotionId,showId,method}),
  });
  if(response.status===401&&typeof window!=="undefined")
   window.dispatchEvent(new Event("ppw:session-lost"));
  if(!response.ok){
   let correction:string|null=null;
   if(response.status===400){
    try{
     const rejected:unknown=await response.json();
     if(rejected&&typeof rejected==="object"&&!Array.isArray(rejected))
      {
       const record=rejected as Record<string,unknown>;
       const mapped=bookingErrorMessage(record.code);
       const ref=record.reference;
       correction=mapped??(
        "Booking request failed — the server could not identify a specific slot. Your edits are still on screen. "+
        "Review contract dates, match divisions and angle targets, then try again."+
        (typeof ref==="string"&&/^[a-f0-9]{12}$/.test(ref)?
         " If it keeps happening, quote support reference "+ref+".":"")
       );
      }
    }catch{ /* Unknown or proxy error: never expose its response body. */ }
   }
   throw new Error(correction??(response.status===409?
    "The World changed. Reload and review your card.":
    response.status===401?"Please sign in again":
    response.status===403?"Booking session expired. Refresh and sign in again.":
    response.status>=500?"Booking request failed — the game server is unavailable. Your edits have not been discarded; retry when it is available.":
    "Booking request failed — the request was rejected. Your edits are still on screen. Check the show and try again."));
  }
  return response.json();
 };
}
