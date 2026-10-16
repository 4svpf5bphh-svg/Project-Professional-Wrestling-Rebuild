/** Exact original packages/sim-core/src/finance.ts calculations.
 * Operates only on the financial totals of one promotion; no DB access.
 */
export type FinancialDistress="HEALTHY"|"WATCH"|"DISTRESSED"|"CRISIS";

export function calculateRunwayWeeks(cash:number,weeklyNet:number):number|null {
 if(!Number.isFinite(cash)||!Number.isFinite(weeklyNet))throw new Error("Invalid promotion financial state");
 if(weeklyNet>=0)return null;
 if(cash<=0)return 0;
 return Math.round((cash/Math.abs(weeklyNet))*10)/10;
}

export function determineFinancialDistress(cash:number,weeklyNet:number):FinancialDistress {
 if(!Number.isFinite(cash)||!Number.isFinite(weeklyNet))throw new Error("Invalid promotion financial state");
 if(cash<=0)return "CRISIS";
 if(weeklyNet>=0)return "HEALTHY";
 const runway=calculateRunwayWeeks(cash,weeklyNet)??Number.POSITIVE_INFINITY;
 if(runway>20)return "HEALTHY";
 if(runway>8)return "WATCH";
 if(runway>2)return "DISTRESSED";
 return "CRISIS";
}
