/** Non-binding owner allocations, independent of settlement accounting. */
export interface PromotionSpendingPlan{
 weeklyWageLimit:number;showTalentLimit:number;cashReserve:number;
}
export function assessPromotionSpendingPlan(plan:PromotionSpendingPlan,input:{
 cash:number;weeklyGuarantees:number;nextShowAppearanceFees?:number|null;
}){
 const valid=(x:number)=>Number.isSafeInteger(x)&&x>=0&&x<=1000000000;
 if(![plan.weeklyWageLimit,plan.showTalentLimit,plan.cashReserve].every(valid))
  throw new Error("Invalid spending allocation");
 const wageRoom=plan.weeklyWageLimit-input.weeklyGuarantees;
 const showFees=input.nextShowAppearanceFees??null;
 const showRoom=showFees===null?null:plan.showTalentLimit-showFees;
 const unreservedCash=Math.max(0,input.cash-plan.cashReserve);
 return {wageRoom,showRoom,unreservedCash,
  wagePosition:wageRoom<0?"OVER":wageRoom===0?"FULL":"WITHIN",
  showPosition:showRoom===null?"UNKNOWN":showRoom<0?"OVER":showRoom===0?"FULL":"WITHIN",
  reserveAtRisk:input.cash<plan.cashReserve};
}
