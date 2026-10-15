import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {inspectWeekConflicts} from "./week-conflicts.js";

export interface AdvanceResolvedWeekInput {
  worldId:string; requestId:string; expectedRevision:number;
}

/** Trusted scheduler/recovery entry point, NOT a player API.
 * All active promotions must have submitted AND resolved their shows. The
 * future arbitration/AI/staff pipeline must then certify the week separately.
 * A missing resolution or seal fails closed; never silently skip a promotion.
 */
export async function advanceResolvedWorldWeek(pool:TransactionPool,input:AdvanceResolvedWeekInput) {
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"ADVANCE_RESOLVED_WORLD_WEEK",
    execute:async tx=>{
      const states=await tx.query<{year:number;week:number;phase:string}>(
        "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[input.worldId],
      );
      if(states.length!==1 || states[0]!.phase!=="RESOLVING") throw new Error("World is not resolving");
      const {year,week}=states[0]!;
      if(!Number.isSafeInteger(year)||year<1||year>=2147483647
        ||!Number.isSafeInteger(week)||week<1||week>52) throw new Error("Invalid World clock");
      const weekIndex=(year-1)*52+week-1;
      if(!Number.isSafeInteger(weekIndex)) throw new Error("Invalid World week");
      // The existing World+promotion index and unique submitted-week index
      // bound this read to current shows, not the accumulated World history.
      // There is intentionally NO player-scoped access to these internals.
      const ready=await tx.query<{
        required_promotions:number;resolved_promotions:number;certified_promotions:number|null;
      }>(
        `SELECT count(*)::integer AS required_promotions,
                count(r.show_id)::integer AS resolved_promotions,
                (SELECT s.certified_promotions FROM ppw_week_resolution_seals s
                  WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3) AS certified_promotions
           FROM ppw_promotions p
           LEFT JOIN ppw_booking_drafts d
             ON d.world_id=p.world_id AND d.promotion_id=p.promotion_id
             AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
           LEFT JOIN ppw_show_resolutions r
             ON r.world_id=d.world_id AND r.show_id=d.draft_id
             AND r.promotion_id=p.promotion_id AND r.resolved_week_index=$4
          WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'`,
        [input.worldId,year,week,weekIndex],
      );
      if(ready.length!==1) throw new Error("World readiness lookup failed");
      const {required_promotions:required,resolved_promotions:resolved,
        certified_promotions:certified}=ready[0]!;
      if(required<1) throw new Error("World has no active promotions");
      if(resolved!==required) throw new Error("World week incomplete: active promotions need resolved shows");
      if(certified!==required) throw new Error("World week has no valid resolution certification");
      // A certificate alone is not enough: re-check submitted cards in this
      // SAME locked World transaction, so stale approvals cannot skip collisions.
      const conflicts=await inspectWeekConflicts(tx,input.worldId);
      if(!conflicts.provisionalClear || conflicts.activePromotions!==required)
        throw new Error("World week has unresolved schedule conflicts");
      // Retain the canonical daily cadence (a 52-week year, 1 real day/week).
      // If the resolver misses a whole day, do not reopen with a deadline
      // already in the past; this needs an explicit recovery policy.
      const moved=await tx.query<{year:number;week:number}>(
        `UPDATE ppw_worlds
           SET year=CASE WHEN week=52 THEN year+1 ELSE year END,
               week=CASE WHEN week=52 THEN 1 ELSE week+1 END,
               day=1,phase='OPEN',next_lock_at=next_lock_at+interval '1 day'
         WHERE world_id=$1 AND phase='RESOLVING'
           AND year=$2 AND week=$3
           AND next_lock_at+interval '1 day'>clock_timestamp()
         RETURNING year,week`,
        [input.worldId,year,week],
      );
      if(moved.length!==1) throw new Error("World rollover deadline expired; recovery required");
      await tx.query(
        "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload) VALUES($1,$2,$3,'WORLD_WEEK_COMPLETED',$4::jsonb)",
        [input.worldId,year,week,JSON.stringify({resolvedPromotions:resolved})],
      );
      return {completedYear:year,completedWeek:week,
        nextYear:moved[0]!.year,nextWeek:moved[0]!.week,resolvedPromotions:resolved};
    },
  });
}
