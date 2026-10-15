import type {TransactionPool} from "./transaction.js";
import {withWorldTransaction} from "./transaction.js";
import {inspectRecordedWeekArbitration} from "./recorded-week-arbitration.js";
import {planResourceRemediations} from "../domain/resource-remediation.js";

/** Trusted server preview. Single transaction and zero N+1 queries. */
export async function previewWorldWeekRemediations(pool:TransactionPool,worldId:string){
  return withWorldTransaction(pool,async tx=>{
    const existing=await inspectRecordedWeekArbitration(tx,worldId);
    if(existing.status!=="CURRENT")
      return {status:existing.status,year:existing.year,week:existing.week};
    const venues=await tx.query<{venue_id:string}>(
      "SELECT venue_id FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE' ORDER BY venue_id LIMIT 257",
      [worldId],
    );
    if(venues.length>256)throw new Error("Venue alternative catalogue exceeds first-version limit");
    const plan=planResourceRemediations(existing.report.arbitrationClaims,
      existing.outcomes,venues.map(x=>x.venue_id));
    return {status:"CURRENT" as const,year:existing.year,week:existing.week,
      sourceFingerprint:existing.sourceFingerprint,...plan};
  });
}
