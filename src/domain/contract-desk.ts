import {contractAvailability, type ContractAvailabilityInput} from "./contract-availability.js";

/** Portable contract desk rules adapted from original PPW. Pure presentation
 * signals only: offers and date purchases require authoritative commands. */
export interface ContractDeskTerms extends ContractAvailabilityInput {
  contractId:string;
  personId:string;
  name:string;
}
export interface ContractDeskEntry {
  contractId:string;personId:string;name:string;
  family:ContractAvailabilityInput["family"];
  remainingDates:number|null;expiresWeekIndex:number;
  availableForBooking:boolean;reason:ReturnType<typeof contractAvailability>["reason"];
  weeksRemaining:number;expiringSoon:boolean;needsAttention:boolean;
  renewalEligible:boolean;additionalDatesEligible:boolean;
}
export function contractDeskEntry(c:ContractDeskTerms):ContractDeskEntry {
  const availability=contractAvailability(c);
  const weeksRemaining=Math.max(0,c.expiresWeekIndex-c.currentWeekIndex+1);
  const expiringSoon=weeksRemaining<=4;
  const started=c.startWeekIndex===undefined||c.currentWeekIndex>=c.startWeekIndex;
  const renewalEligible=c.status==="SIGNED"&&c.family!=="ONE_OFF"&&weeksRemaining>0;
  const additionalDatesEligible=started&&c.status==="SIGNED"&&c.family==="LIMITED_NON_EXCLUSIVE"
    &&weeksRemaining>0&&c.remainingDates!==null;
  return {
    contractId:c.contractId,personId:c.personId,name:c.name,family:c.family,
    remainingDates:c.remainingDates,expiresWeekIndex:c.expiresWeekIndex,
    availableForBooking:availability.available,reason:availability.reason,
    weeksRemaining,expiringSoon,needsAttention:expiringSoon||availability.reason==="NO_DATES",
    renewalEligible,additionalDatesEligible,
  };
}
