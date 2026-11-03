/**
 * Cost exposure used by the Talent Market and Business finance tools.
 *
 * Planning assumes every purchased appearance is used. Only wages and an
 * accepted signing bonus are committed upfront; appearance fees are actually
 * charged by the authoritative show settlement when the wrestler is booked.
 */
export interface ContractCostTerms{
 weeks:number;dates:number;weeklyGuarantee:number;appearanceFee:number;signingBonus:number;
}
export interface ContractCostForecast{
 weeks:number;dates:number;guaranteedWages:number;
 plannedAppearanceFees:number;oneTimeBonus:number;plannedFullTermCost:number;
 averageWeeklyCost:number;
}
export function forecastContractCost(input:ContractCostTerms):ContractCostForecast{
 const numbers=[input.weeks,input.dates,input.weeklyGuarantee,
  input.appearanceFee,input.signingBonus];
 if(numbers.some(n=>!Number.isFinite(n)||n<0)||
  !Number.isInteger(input.weeks)||input.weeks<1||
  !Number.isInteger(input.dates))
  throw new Error("Contract weeks, dates and costs must be valid non-negative amounts");
 const guaranteedWages=input.weeks*input.weeklyGuarantee;
 const plannedAppearanceFees=input.dates*input.appearanceFee;
 const plannedFullTermCost=guaranteedWages+plannedAppearanceFees+input.signingBonus;
 if(!Number.isSafeInteger(plannedFullTermCost))
  throw new Error("Contract totals exceed the supported financial range");
 return {weeks:input.weeks,dates:input.dates,guaranteedWages,
  plannedAppearanceFees,oneTimeBonus:input.signingBonus,
  plannedFullTermCost,averageWeeklyCost:plannedFullTermCost/input.weeks};
}
