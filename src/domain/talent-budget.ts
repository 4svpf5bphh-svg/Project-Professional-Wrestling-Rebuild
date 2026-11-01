/** Read-only talent spend forecast: appearance fees are conditional. */
export interface BudgetContract{personId:string;contractId:string;family:string;status:string;
 startWeekIndex:number;expiresWeekIndex:number;remainingDates:number|null;
 weeklyGuarantee:number;appearanceFee:number}
export interface BudgetFinance{cash:number;weeklyMediaIncome:number|null;
 weeklySponsorIncome:number|null;weeklyFixedOverhead:number|null;staffPayroll:number}
export function forecastTalentBudget(contracts:readonly BudgetContract[],week:number,
 finance:BudgetFinance,horizon=4){
 if(!Number.isSafeInteger(week)||week<0||!Number.isSafeInteger(horizon)||
  horizon<1||horizon>12)throw new Error("Invalid talent forecast");
 const active=(w:number)=>contracts.filter(c=>c.status==="SIGNED"&&
  c.startWeekIndex<=w&&c.expiresWeekIndex>=w);
 const wages=(w:number)=>active(w).reduce((v,c)=>v+c.weeklyGuarantee,0);
 const remaining=new Map(contracts.map(c=>[c.contractId,c.remainingDates??0]));
 const eligible=(w:number)=>{
  const people=new Map<string,BudgetContract>();
  for(const c of active(w).filter(c=>c.family==="EXCLUSIVE"||
   (remaining.get(c.contractId)??0)>0)){
   const prev=people.get(c.personId);
   if(!prev||c.startWeekIndex>prev.startWeekIndex||
    c.startWeekIndex===prev.startWeekIndex&&c.contractId<prev.contractId)
    people.set(c.personId,c);
  }
  return [...people.values()];
 };
 const now=eligible(week),oneShowFullRosterExposure=now.reduce((v,c)=>v+c.appearanceFee,0);
 let futureGuaranteedWages=0,scenarioAppearanceFees=0;
 for(let i=0;i<horizon;i++){
  futureGuaranteedWages+=wages(week+i);
  for(const c of eligible(week+i)){
   scenarioAppearanceFees+=c.appearanceFee;
   if(c.family!=="EXCLUSIVE")remaining.set(c.contractId,(remaining.get(c.contractId)??0)-1);
  }
 }
 const known=finance.weeklyMediaIncome!==null&&finance.weeklySponsorIncome!==null&&
  finance.weeklyFixedOverhead!==null;
 const baselineCash=known?finance.cash+horizon*(finance.weeklyMediaIncome!+
  finance.weeklySponsorIncome!-finance.weeklyFixedOverhead!-finance.staffPayroll)-
  futureGuaranteedWages:null;
 return {cash:finance.cash,horizon,currentGuarantees:wages(week),
  eligibleTalent:now.length,oneShowFullRosterExposure,
  futureGuaranteedWages,scenarioAppearanceFees,baselineCash,
  scenarioCash:baselineCash===null?null:baselineCash-scenarioAppearanceFees};
}
