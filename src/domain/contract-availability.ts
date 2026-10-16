/** Pure contract availability rules; no DB reads and no hidden simulation
 * mutations. Week indexes are canonical PPW World weeks, not biological time.
 */
export interface ContractAvailabilityInput {
  family:"ONE_OFF"|"LIMITED_NON_EXCLUSIVE"|"EXCLUSIVE";
  status:"SIGNED"|"EXPIRED"|"TERMINATED";
  remainingDates:number|null;
  expiresWeekIndex:number;
  currentWeekIndex:number;
}
export type ContractAvailabilityReason =
  | "AVAILABLE" | "NOT_SIGNED" | "EXPIRED" | "NO_DATES" | "INVALID_CONTRACT";

export function contractAvailability(c:ContractAvailabilityInput):{
  available:boolean;reason:ContractAvailabilityReason;
} {
  if (!Number.isSafeInteger(c.currentWeekIndex)||c.currentWeekIndex<0 ||
      !Number.isSafeInteger(c.expiresWeekIndex)||c.expiresWeekIndex<0 ||
      (c.remainingDates!==null&&(!Number.isSafeInteger(c.remainingDates)||c.remainingDates<0))) {
    return {available:false,reason:"INVALID_CONTRACT"};
  }
  if (c.status!=="SIGNED") return {available:false,reason:"NOT_SIGNED"};
  if (c.currentWeekIndex>c.expiresWeekIndex) return {available:false,reason:"EXPIRED"};
  // Ported from the original PPW contractHasAppearanceRights rule:
  // exclusivity buys appearances throughout the term, not a finite date allowance.
  if (c.family==="EXCLUSIVE") return {available:true,reason:"AVAILABLE"};
  if (c.remainingDates===null) return {available:false,reason:"INVALID_CONTRACT"};
  if (c.remainingDates===0) return {available:false,reason:"NO_DATES"};
  return {available:true,reason:"AVAILABLE"};
}
