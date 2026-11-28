import {minimumExclusiveWeeklyGuarantee,type OfferTerms} from "./contract-economics.js";
import {sameTermsRenewal,type RenewalContract} from "./renewal-terms.js";

export const renewalStrategies=["EXISTING_TERMS","PRIORITY_RETENTION","BALANCED","REDUCE_COSTS"] as const;
export type RenewalStrategy=typeof renewalStrategies[number];
export interface RenewalDelegation {
 strategy:RenewalStrategy;
 maxWeeklyGuarantee:number;
 maxAppearanceFee:number;
}
export function readRenewalDelegation(raw:unknown):RenewalDelegation{
 if(!raw||typeof raw!=="object")throw new Error("Invalid Talent Manager delegation");
 const value=raw as RenewalDelegation;
 if(!renewalStrategies.includes(value.strategy)||
  ![value.maxWeeklyGuarantee,value.maxAppearanceFee].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1_000_000_000))
  throw new Error("Choose a negotiation strategy and enter valid financial limits");
 return value;
}

export function delegatedRenewalTerms(contract:RenewalContract,authority:RenewalDelegation,context:{
 insight:number;morale:number;trust:number;marketValue:number;popularity:number;
}):OfferTerms|null{
 const original=sameTermsRenewal(contract);
 if(!original)return null;
 const startWeekIndex=contract.expiresWeekIndex+1;
 const terms={...original,startWeekIndex,roleExpectation:original.roleExpectation as OfferTerms["roleExpectation"],
  creativeControl:original.creativeControl as OfferTerms["creativeControl"]};
 const floor=terms.family==="EXCLUSIVE"?minimumExclusiveWeeklyGuarantee(context.marketValue):0;
 if(authority.strategy!=="EXISTING_TERMS"){
  const relationship=(context.morale+context.trust)/2;
  const leverage=Math.max(-.08,Math.min(.08,(context.insight-55)/350+(relationship-50)/550));
  const value=Math.max(.7,Math.min(1.3,context.marketValue/Math.max(1,terms.weeklyGuarantee+terms.appearanceFee)));
  const priority=authority.strategy==="PRIORITY_RETENTION";
  const balanced=authority.strategy==="BALANCED";
  const multiplier=priority?1.20+Math.max(0,(55-relationship)/200)+(context.popularity/1000):
   balanced?1+(value-1)*.45-leverage:Math.min(.94,.88-leverage);
  terms.weeklyGuarantee=Math.max(floor,Math.min(authority.maxWeeklyGuarantee,
   Math.round(original.weeklyGuarantee*multiplier)));
  terms.appearanceFee=Math.min(authority.maxAppearanceFee,Math.round(original.appearanceFee*multiplier));
  if(priority&&(terms.weeklyGuarantee<original.weeklyGuarantee||terms.appearanceFee<original.appearanceFee))return null;
  if(!priority&&!balanced&&terms.weeklyGuarantee+terms.appearanceFee>=original.weeklyGuarantee+original.appearanceFee)return null;
 }
 return terms.weeklyGuarantee>=floor&&terms.weeklyGuarantee<=authority.maxWeeklyGuarantee&&
  terms.appearanceFee<=authority.maxAppearanceFee?terms:null;
}
