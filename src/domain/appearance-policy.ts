/** Booking consumption policy, deliberately independent of persistence.
 * Charge once per wrestler per show, not once per match or segment.
 * A World resolution command must persist its idempotency receipt and these
 * decrements in the same transaction before announcing the show as resolved.
 */
export interface BookedAppearance {
  personId:string;
  contractId:string;
}
export function uniqueShowAppearances(items:readonly BookedAppearance[]):BookedAppearance[] {
  const byPerson=new Map<string,string>();
  for(const item of items) {
    if(!item.personId||!item.contractId) throw new Error("Invalid booked appearance");
    const existing=byPerson.get(item.personId);
    if(existing && existing!==item.contractId) throw new Error("Multiple contracts for one performer in a show");
    byPerson.set(item.personId,item.contractId);
  }
  return [...byPerson].map(([personId,contractId])=>({personId,contractId}));
}
