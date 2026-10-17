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
  if(!["overview","load","talent","save","ready","results","programmes","startProgramme","endProgramme","stables","createStable",
   "addStableMember","removeStableMember","disbandStable","stableChoices",
   "workingConnections","persona","requestPersona","backstage","markBackstageRead",
   "backstageArchive","backstageDecision","resultsArchive",
   "championships","championshipHistory","tagTeams","createTagTeam","renameTagTeam",
   "planner","planShow","calendar","saveCalendar","archiveCalendar","contracts","wrestlerDirectory","submitContractOffer","business","staff","setStaffContinuity","industry","requestContractDates","cancelContractDates","renewContract",
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
  if(!response.ok)throw new Error(response.status===409?
   "The World changed. Reload and review your card.":
   response.status===401?"Please sign in again":
   response.status===403?"Booking session expired. Refresh and sign in again.":
   "Booking request failed");
  return response.json();
 };
}
