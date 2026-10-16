/** Adapted from original PPW contract-renewal.ts: staff can propose, never sign. */
export interface RenewalContract {
 family:"ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE";
 status:"SIGNED"|"EXPIRED"|"TERMINATED";
 startWeekIndex:number;expiresWeekIndex:number;dateEntitlement:number|null;
 weeklyGuarantee:number;appearanceFee:number;roleExpectation:string;creativeControl:string;
}
export function sameTermsRenewal(c:RenewalContract){
 if(c.status!=="SIGNED"||c.family==="ONE_OFF")return null;
 const termWeeks=c.expiresWeekIndex-c.startWeekIndex+1;
 const allowed=c.family==="EXCLUSIVE"?[13,26,52]:[4,13,26];
 if(!Number.isSafeInteger(c.weeklyGuarantee)||c.weeklyGuarantee<0||
 !Number.isSafeInteger(c.appearanceFee)||c.appearanceFee<0||
 !allowed.includes(termWeeks)||c.dateEntitlement===null||
 c.dateEntitlement<1||c.dateEntitlement>104||c.dateEntitlement>termWeeks*2)return null;
 return {family:c.family,termWeeks,
 dateEntitlement:c.family==="EXCLUSIVE"?termWeeks:c.dateEntitlement,
 weeklyGuarantee:c.weeklyGuarantee,appearanceFee:c.appearanceFee,
 roleExpectation:c.roleExpectation,creativeControl:c.creativeControl,signingBonus:0 as const};
}
