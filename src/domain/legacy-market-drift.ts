/** Original packages/sim-core/src/events.ts:updateMarketAfterEvent,
 * source-preserving one-decimal local state evolution. */
import type {EventType,LocalAudience} from "./legacy-show-economics.js";
const clamp=(x:number)=>Math.max(2,Math.min(100,x));
const round=(x:number)=>Math.round(clamp(x)*10)/10;
export interface OriginalMarketResult {
 eventType:EventType;isHomeMarket:boolean;expectedDemand:number;
 attendance:number;capacity:number;averageMatchRating:number;crowdResponse:number;
}
export function originalMarketAfterEvent(
 before:LocalAudience,r:OriginalMarketResult,
):LocalAudience{
 const numbers=[before.awareness,before.liveStrength,before.loyalty,
  r.expectedDemand,r.attendance,r.capacity,r.averageMatchRating,r.crowdResponse];
 if(numbers.some(n=>typeof n!=="number"||!Number.isFinite(n))||
  Object.values(before).some(n=>n<0||n>100)||
  r.expectedDemand<100||r.capacity<1||r.attendance<0||r.attendance>r.capacity||
  r.averageMatchRating<.5||r.averageMatchRating>5||
  r.crowdResponse<0||r.crowdResponse>100||
  !["REGULAR","MAJOR"].includes(r.eventType))
  throw new Error("Invalid original market drift inputs");
 const demandPerformance=r.attendance/r.expectedDemand;
 const sellThrough=r.attendance/r.capacity;
 const importance=r.eventType==="MAJOR"?1.35:1;
 const qualityEffect=(r.averageMatchRating-2.75)*.18+(r.crowdResponse-60)/180;
 const strengthDelta=(demandPerformance>=.95?1.1*importance:
  demandPerformance>=.72?.55*importance:
  demandPerformance<.45?-.45:.1)+qualityEffect;
 const awarenessDelta=r.isHomeMarket?
  (r.eventType==="MAJOR"?.5:.2):
  (r.eventType==="MAJOR"?1.4:.75);
 const loyaltyDelta=sellThrough>=.75?.25:sellThrough<.3?-.2:.05;
 return {liveStrength:round(before.liveStrength+strengthDelta),
  awareness:round(before.awareness+awarenessDelta),
  loyalty:round(before.loyalty+loyaltyDelta)};
}

// Long-run correction, kept separate from the exact original calculation above.
// A successful gate is evidence of drawing power, not automatically of a good
// show: below-par matches and crowd reception reduce its repeat-audience credit.
// Established territories require consistently strong events to keep growing.
// No new state, randomness, World reads or changes to awareness/loyalty.
export function balancedMarketAfterEvent(
 before:LocalAudience,r:OriginalMarketResult,
):LocalAudience{
 const legacy=originalMarketAfterEvent(before,r); // shared validation and parity
 const ratio=r.attendance/r.expectedDemand;
 const importance=r.eventType==="MAJOR"?1.35:1;
 const attendanceCredit=ratio>=.95?1.1*importance:
  ratio>=.72?.55*importance:ratio<.45?-.45:.1;
 const qualityEffect=(r.averageMatchRating-2.75)*.18+(r.crowdResponse-60)/180;
 const reception=Math.max(0,Math.min(1,
  (r.averageMatchRating-2.5)*.65+(r.crowdResponse-50)/40));
 const earnedCredit=attendanceCredit>0?attendanceCredit*reception:attendanceCredit;
 const established=Math.max(0,Math.min(1,(before.liveStrength-75)/25));
 const upkeep=1.15*established*established;
 return {...legacy,liveStrength:round(before.liveStrength+earnedCredit+qualityEffect-upkeep)};
}
