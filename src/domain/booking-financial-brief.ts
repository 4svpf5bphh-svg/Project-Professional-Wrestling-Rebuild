/** Booking-side financial scenario, never an accounting write.
 * Existing Show Card, contract and staff snapshots are sufficient: one
 * card read, no second Business RPC, no speculative ticket or PPV sales.
 */
export interface BookingFinanceSnapshot{
 currentWeekIndex:number;
 cash:number;media:number|null;sponsor:number|null;overhead:number|null;
 wages:number;staff:number;showTalentLimit:number|null;cashReserve:number|null;
}
export interface FeeEstimate{amount:number;performers:number;unknown:number;complete:boolean}
export interface BookingFinanceBrief{
 fees:number;unknownFees:number;talentLimit:number|null;
 cashReserve:number|null;weeklyGuaranteedOutgoings:number;
 weeklyFixedMargin:number|null;
 fourWeeks:number|null;eightWeeks:number|null;
 breachesTalentLimit:boolean;mayBreachTalentLimit:boolean;
 projectedBelowReserve:boolean;reserveUnknown:boolean;
}
/** A deliberately narrow no-ticket-sales baseline. The current show's
 * appearance bill is deducted exactly ONCE and only inside the horizon
 * that contains the show. No future shows, bonuses, taxes, ticket sales,
 * production, travel, venue, contract changes or deal renewals are guessed.
 */
export function bookingFinanceBrief(snapshot:BookingFinanceSnapshot|null|undefined,
 fees:FeeEstimate,showWeekIndex:number):BookingFinanceBrief|null{
 if(!snapshot||!Number.isSafeInteger(snapshot.currentWeekIndex)||
  !Number.isSafeInteger(showWeekIndex)||showWeekIndex<snapshot.currentWeekIndex||
  !Number.isFinite(snapshot.cash)||
  ![snapshot.wages,snapshot.staff].every(x=>Number.isFinite(x)&&x>=0)||
  !Number.isFinite(fees.amount)||fees.amount<0||fees.unknown<0)
  return null;
 const known=(n:number|null):n is number=>n!==null&&Number.isFinite(n)&&n>=0;
 const weeklyGuaranteedOutgoings=snapshot.wages+snapshot.staff;
 const margin=known(snapshot.media)&&known(snapshot.sponsor)&&
  known(snapshot.overhead)?snapshot.media+snapshot.sponsor-
   snapshot.overhead-weeklyGuaranteedOutgoings:null;
 const delta=showWeekIndex-snapshot.currentWeekIndex;
 const forecast=(weeks:number)=>margin===null?null:
  snapshot.cash+margin*weeks-(delta<weeks?fees.amount:0);
 const cap=known(snapshot.showTalentLimit)?snapshot.showTalentLimit:null;
 const reserve=known(snapshot.cashReserve)?snapshot.cashReserve:null;
 const breaches=cap!==null&&fees.amount>cap;
 const mayBreach=cap!==null&&!fees.complete&&!breaches;
 const cashAfterFee=snapshot.cash-fees.amount;
 return {
  fees:fees.amount,unknownFees:fees.unknown,talentLimit:cap,
  cashReserve:reserve,weeklyGuaranteedOutgoings,weeklyFixedMargin:margin,
  fourWeeks:forecast(4),eightWeeks:forecast(8),
  breachesTalentLimit:breaches,mayBreachTalentLimit:mayBreach,
  projectedBelowReserve:reserve!==null&&cashAfterFee<reserve,
  reserveUnknown:reserve===null
 };
}
