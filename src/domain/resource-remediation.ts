import type {ResourceClaim,ArbitrationOutcome} from "./resource-arbitration.js";

export interface RemediationChoice {kind:"CHANGE_VENUE"|"CHANGE_DAY";day:number;venueId:string}
export interface ShowRemediation {
  promotionId:string;showId:string;currentDay:number;currentVenueId:string;
  reasons:("VENUE"|"WRESTLER")[];choices:RemediationChoice[];
  disposition:"OFFER_ALTERNATIVES"|"CREATIVE_REBOOK_REQUIRED";
  automaticallyApplied:false;
}
export interface ResourceRemediationPlan {shows:ShowRemediation[];unresolvedShows:number}

/** Read-only, canonical alternatives. Never silently change authored results.
 * Every alternative must be revalidated at the point of an authorised action.
 */
export function planResourceRemediations(
  claims:readonly ResourceClaim[],outcomes:readonly ArbitrationOutcome[],
  activeVenueIds:readonly string[],
):ResourceRemediationPlan {
  if(claims.length>12800||outcomes.length>256||activeVenueIds.length>256)
    throw new Error("Resource remediation capacity exceeded");
  const venues=[...new Set(activeVenueIds)];
  if(venues.length!==activeVenueIds.length||venues.some(v=>!v||v.length>200))
    throw new Error("Invalid venue catalogue");
  venues.sort();
  const shows=new Map<string,{promotionId:string;showId:string;day:number;venueId:string}>();
  const peopleByShow=new Map<string,Set<string>>();
  for(const c of claims){
    if(!c.showId||!c.promotionId||!c.resourceId||!Number.isSafeInteger(c.day)||c.day<1||c.day>7)
      throw new Error("Invalid remediation claim");
    if(c.kind==="VENUE"){
      if(shows.has(c.showId))throw new Error("Duplicate show venue claim");
      shows.set(c.showId,{promotionId:c.promotionId,showId:c.showId,day:c.day,venueId:c.resourceId});
    }else if(c.kind==="WRESTLER"){
      const p=peopleByShow.get(c.showId)??new Set<string>();
      p.add(c.resourceId);peopleByShow.set(c.showId,p);
    }else throw new Error("Invalid resource kind");
  }
  const denied=new Map<string,ArbitrationOutcome[]>();
  for(const o of outcomes){
    const show=shows.get(o.denied.showId);
    if(!show||show.promotionId!==o.denied.promotionId)
      throw new Error("Arbitration outcome references unknown show");
    const entries=denied.get(o.denied.showId)??[];
    entries.push(o);denied.set(o.denied.showId,entries);
  }
  const scheduled=[...shows.values()];
  const possible=(showId:string,day:number,venueId:string)=>{
    if(!venues.includes(venueId))return false;
    const participants=peopleByShow.get(showId)??new Set<string>();
    for(const other of scheduled){
      if(other.showId===showId||other.day!==day)continue;
      if(other.venueId===venueId)return false;
      for(const person of peopleByShow.get(other.showId)??[]){
        if(participants.has(person))return false;
      }
    }
    return true;
  };
  const result=[...denied].sort((a,b)=>{
    const x=shows.get(a[0])!,y=shows.get(b[0])!;
    return x.promotionId.localeCompare(y.promotionId,"en")||x.showId.localeCompare(y.showId,"en");
  }).map(([showId,losses]):ShowRemediation=>{
    const show=shows.get(showId)!;
    const choices:RemediationChoice[]=[];
    if(!losses.some(o=>o.reason==="WEEKLY_CAPACITY")){
      for(const v of venues){
        if(v!==show.venueId&&possible(showId,show.day,v)){
          choices.push({kind:"CHANGE_VENUE",day:show.day,venueId:v});break;
        }
      }
      for(let shift=1;shift<=6&&choices.length<3;shift++){
        const day=((show.day-1+shift)%7)+1;
        if(possible(showId,day,show.venueId))
          choices.push({kind:"CHANGE_DAY",day,venueId:show.venueId});
      }
    }
    return {promotionId:show.promotionId,showId,currentDay:show.day,
      currentVenueId:show.venueId,reasons:[...new Set(losses.map(o=>o.kind))].sort(),
      choices,disposition:choices.length?"OFFER_ALTERNATIVES":"CREATIVE_REBOOK_REQUIRED",
      automaticallyApplied:false};
  });
  return {shows:result,unresolvedShows:result.length};
}
