/** Read-only financial envelope for current signed contracts.
 * This is a *remaining* budget outlook, not a charge, cash reserve or forecast
 * of actual appearances. No signing bonus already paid is counted again.
 */
export interface ContractExposure{
 weeksRemaining:number;
 remainingDates:number|null;
 weeklyGuarantee:number;
 appearanceFee:number;
 /** Delay until this signed contract takes effect, when known. */
 startsInWeeks?:number;
}
export interface RosterExposure{
 guaranteedWages:number;
 optionalAppearanceFees:number;
 potentialTotal:number;
 remainingUsableDates:number;
}
export function remainingRosterExposure(contracts:readonly ContractExposure[]):RosterExposure{
 let guaranteedWages=0,optionalAppearanceFees=0,remainingUsableDates=0;
 for(const c of contracts){
  if(![c.weeksRemaining,c.weeklyGuarantee,c.appearanceFee].every(n=>
    Number.isFinite(n)&&n>=0))continue;
  const deferred=c.startsInWeeks===undefined?0:
   Number.isFinite(c.startsInWeeks)?Math.max(0,Math.trunc(c.startsInWeeks)):0;
  const weeks=Math.max(0,Math.trunc(c.weeksRemaining)-deferred);
  if(weeks===0)continue;
  const dates=c.remainingDates===null?0:Math.min(weeks,Math.max(0,
   Number.isFinite(c.remainingDates)?Math.trunc(c.remainingDates):0));
  guaranteedWages+=weeks*c.weeklyGuarantee;
  optionalAppearanceFees+=dates*c.appearanceFee;
  remainingUsableDates+=dates;
 }
 return {guaranteedWages,optionalAppearanceFees,
  potentialTotal:guaranteedWages+optionalAppearanceFees,remainingUsableDates};
}
