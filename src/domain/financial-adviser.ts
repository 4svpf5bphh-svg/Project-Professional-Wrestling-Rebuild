/** Read-only Talent Manager budget scenarios from the existing Business receipt.
 * These recommendations never move money, change a contract or create Neon reads.
 */
import type {PromotionSpendingPlan} from "./promotion-spending-plan.js";
export type BudgetRisk="TIGHT"|"STABLE"|"RISKY";
export interface BudgetBasis{
 cash:number;debt:number;weeklyMediaIncome:number|null;
 weeklySponsorIncome:number|null;weeklyFixedOverhead:number|null;
 weeklyGuarantees:number;weeklyStaffPayroll:number;
 recentShowAppearanceFees:number;lastWeeklyNet:number|null;
}
export interface BudgetScenario{
 id:BudgetRisk;label:string;description:string;plan:PromotionSpendingPlan;
}
const safe=(x:number|null|undefined)=>Math.max(0,Number.isFinite(x??NaN)?x!:0);
const round=(x:number)=>Math.max(0,Math.min(1_000_000_000,
 Math.ceil(Math.max(0,x)/1000)*1000));
/** Owner override always remains possible; these are guide rails, not permissions. */
export function recommendPromotionBudgets(basis:BudgetBasis):{
 scenarios:readonly BudgetScenario[];
 summary:string;weeklyIncome:number;weeklyCosts:number;operatingRoom:number;
}{
 const cash=safe(basis.cash),income=safe(basis.weeklyMediaIncome)+safe(basis.weeklySponsorIncome);
 const wage=safe(basis.weeklyGuarantees);
 const fixed=safe(basis.weeklyFixedOverhead)+safe(basis.weeklyStaffPayroll);
 const weeklyCosts=fixed+wage;
 const room=income-weeklyCosts;
 const surplus=Math.max(0,room);
 // The current roster is already committed; no scenario pretends wages can
 // be reduced without a separate, authorised contract action.
 const cashBuffer=Math.max(0,cash-Math.max(weeklyCosts*8,safe(basis.debt)));
 const growth=Math.min(cashBuffer/52,Math.max(1000,weeklyCosts))*0.25;
 const lastAppearance=safe(basis.recentShowAppearanceFees);
 const showBase=Math.max(1000,lastAppearance,surplus*0.35);
 const reserve=(weeks:number,ratio:number)=>round(Math.min(cash,
  Math.max(weeklyCosts*weeks,cash*ratio,safe(basis.debt))));
 const scenarios:BudgetScenario[]=[
  {id:"TIGHT",label:"Tight",description:"Protect cash; limit new guarantees and show fees.",
   plan:{weeklyWageLimit:round(wage+surplus*0.2),
    showTalentLimit:round(Math.min(showBase*0.75,Math.max(1000,surplus))),
    cashReserve:reserve(12,0.3)}},
  {id:"STABLE",label:"Stable",description:"Allow measured growth from dependable income.",
   plan:{weeklyWageLimit:round(wage+surplus*0.7),
    showTalentLimit:round(Math.max(1000,showBase+surplus*0.15)),
    cashReserve:reserve(8,0.2)}},
  {id:"RISKY",label:"Risky",description:"Spend ahead of returns; protect a smaller reserve.",
   plan:{weeklyWageLimit:round(wage+surplus*1.35+growth),
    showTalentLimit:round(showBase*1.55+Math.max(0,safe(basis.lastWeeklyNet))*0.15),
    cashReserve:reserve(4,0.1)}}
 ];
 const incomeState=basis.weeklyMediaIncome===null||basis.weeklySponsorIncome===null?
  " Some commercial income is unconfirmed.":"";
 const summary="Network and sponsor income "+round(income).toLocaleString("en-GB")+
  "/week; wages, staff and overhead "+round(weeklyCosts).toLocaleString("en-GB")+
  "/week. Operating room "+(room<0?"-":"")+round(Math.abs(room)).toLocaleString("en-GB")+
  "/week before event costs. Recent event income is not guaranteed."+incomeState;
 return {scenarios,summary,weeklyIncome:income,weeklyCosts,operatingRoom:room};
}
