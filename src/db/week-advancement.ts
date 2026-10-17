import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {settleWeeklyPromotionHealth} from "./weekly-finance-health.js";
import {settleWeekLocalMarkets} from "./market-response.js";
import {refreshWorldProgrammeSignals} from "./programme-week-signals.js";
import {settleBackstagePromises,publishBackstageRequests} from "./backstage-conversations.js";
import {publishBackstageTeamMoments} from "./backstage-team-moments.js";
import {settleBackstageMediations} from "./backstage-mediation.js";
import {closeUnavailableBackstageRequests} from "./backstage-closure.js";
import {settleBackstageContractDiscussions}
 from "./backstage-contract-followthrough.js";
import {publishBackstageTagPitches,settleBackstageTagFollowThrough}
 from "./backstage-tag-pitches.js";
import {publishBackstageRivalryPitches,settleBackstageRivalryFollowThrough}
 from "./backstage-rivalry-pitches.js";

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
        required_promotions:number;resolved_promotions:number;
        certified_promotions:number|null;cleared_promotions:number|null;
      }>(
        `SELECT count(*)::integer AS required_promotions,
                count(r.show_id)::integer AS resolved_promotions,
                (SELECT s.certified_promotions FROM ppw_week_resolution_seals s
                  WHERE s.world_id=$1 AND s.year=$2 AND s.week=$3) AS certified_promotions,
                (SELECT c.eligible_promotions FROM ppw_week_resource_clearances c
                  WHERE c.world_id=$1 AND c.year=$2 AND c.week=$3) AS cleared_promotions
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
        certified_promotions:certified,cleared_promotions:cleared}=ready[0]!;
      if(required<1) throw new Error("World has no active promotions");
      if(resolved!==required) throw new Error("World week incomplete: active promotions need resolved shows");
      if(cleared!==required) throw new Error("World week has no valid pre-resolution resource clearance");
      if(certified!==required) throw new Error("World week has no valid resolution certification");
      // The new detailed results are a second mandatory durable layer.
      // Legacy date-charge receipts alone cannot certify published results.
      const detailed=await tx.query<{completed_promotions:number;invalid_results:number;
        missing_economics:number}>(
        `SELECT count(c.show_id)::integer AS completed_promotions,
                count(*) FILTER (WHERE c.show_id IS NOT NULL AND
                  (c.year<>$2 OR c.week<>$3 OR c.promotion_id<>p.promotion_id))::integer
                  AS invalid_results,
                count(*) FILTER (WHERE w.show_economics_enabled AND
                  c.show_id IS NOT NULL AND econ.show_id IS NULL)::integer
                  AS missing_economics
           FROM ppw_promotions p
           JOIN ppw_worlds w ON w.world_id=p.world_id
           LEFT JOIN ppw_booking_drafts d
             ON d.world_id=p.world_id AND d.promotion_id=p.promotion_id
             AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
           LEFT JOIN ppw_completed_shows c
             ON c.world_id=d.world_id AND c.show_id=d.draft_id
           LEFT JOIN ppw_show_economics econ
             ON econ.world_id=c.world_id AND econ.show_id=c.show_id
           WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'`,
        [input.worldId,year,week],
      );
      if(detailed.length!==1||detailed[0]!.completed_promotions!==required||
       detailed[0]!.invalid_results!==0||
       detailed[0]!.missing_economics!==0)
        throw new Error("World week incomplete: detailed show results missing or mismatched");
      // A detailed receipt is not sufficient without its legacy resource
      // charge. Both records must point to the same submitted canonical show.
      const paired=await tx.query<{paired_promotions:number;orphan_results:number}>(
        `SELECT count(*) FILTER (WHERE c.show_id IS NOT NULL AND
             r.show_id IS NOT NULL)::integer AS paired_promotions,
           count(*) FILTER (WHERE c.show_id IS NOT NULL AND
             r.show_id IS NULL)::integer AS orphan_results
         FROM ppw_promotions p
         LEFT JOIN ppw_booking_drafts d
           ON d.world_id=p.world_id AND d.promotion_id=p.promotion_id
           AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
         LEFT JOIN ppw_completed_shows c
           ON c.world_id=d.world_id AND c.show_id=d.draft_id
           AND c.promotion_id=p.promotion_id
         LEFT JOIN ppw_show_resolutions r
           ON r.world_id=d.world_id AND r.show_id=d.draft_id
           AND r.promotion_id=p.promotion_id AND r.resolved_week_index=$4
         WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'`,
        [input.worldId,year,week,weekIndex],
      );
      if(paired.length!==1||paired[0]!.paired_promotions!==required||
       paired[0]!.orphan_results!==0)
        throw new Error("World week incomplete: detailed results and resource receipts disagree");
      // A certificate alone is not enough: re-check submitted cards in this
      // SAME locked World transaction, so stale approvals cannot skip collisions.
      const conflicts=await inspectWeekConflicts(tx,input.worldId);
      if(!conflicts.provisionalClear || conflicts.activePromotions!==required)
        throw new Error("World week has unresolved schedule conflicts");
      // No certified World can bypass unsettled wrestler negotiations.
      const outstanding=await tx.query<{pending:boolean}>(`
       SELECT (EXISTS(SELECT 1 FROM ppw_contract_offers WHERE world_id=$1 AND status='PENDING')
        OR EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals WHERE world_id=$1 AND status='PENDING')
        OR EXISTS(SELECT 1 FROM ppw_contract_date_requests WHERE world_id=$1 AND status='PENDING'))
        AS pending`,[input.worldId]);
      if(outstanding[0]!.pending)throw new Error("Contract desk negotiations must resolve before World rollover");
      // The original simulator decays inactive rivalries every week, not only
      // when a segment was booked. One indexed, bounded global history read.
      await refreshWorldProgrammeSignals(tx,input.worldId,weekIndex);
      // Market response must update while the World is still RESOLVING;
      // the eventual clock move/payroll/health writes share this transaction.
      await settleWeekLocalMarkets(tx,input.worldId,year,week);
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
      // Original PPW charges wages even if limited dates are exhausted.
      // One grouped debit and ledger insert, regardless of roster size.
      await tx.query(`
        WITH payroll AS (
          SELECT c.promotion_id,sum(c.weekly_guarantee)::bigint AS amount
          FROM ppw_contracts c JOIN ppw_promotions active_p
            ON active_p.world_id=c.world_id AND active_p.promotion_id=c.promotion_id
           WHERE c.world_id=$1 AND c.status='SIGNED'
            AND active_p.lifecycle NOT IN ('DORMANT','CLOSED')
            AND c.start_week_index<=$4 AND c.expires_week_index>=$4
          GROUP BY c.promotion_id
        ), charged AS (
          UPDATE ppw_promotions p SET cash=p.cash-payroll.amount
          FROM payroll WHERE p.world_id=$1 AND p.promotion_id=payroll.promotion_id
          RETURNING p.promotion_id,payroll.amount
        )
        INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
        SELECT $1,$2,$3,'CONTRACT_GUARANTEE_PAID',
          jsonb_build_object('promotionId',promotion_id,'amount',amount)
        FROM charged`,[input.worldId,year,week,weekIndex]);
      // Original packages/sim-core/src/finance.ts settles recurring media,
      // sponsors and overhead once per completed week, excluding dormant/
      // closed promotions. Only populated ORIGINAL economic profiles qualify;
      // NULL fixtures never receive fabricated finance values. One write
      // updates all promotions and records compact category totals, not a
      // historical financial-transaction row per category and promotion.
      await tx.query(`
        WITH credited AS (
         UPDATE ppw_promotions p SET
          cash=p.cash+p.weekly_media_income+p.weekly_sponsor_income-p.weekly_fixed_overhead
         WHERE p.world_id=$1 AND p.lifecycle NOT IN ('DORMANT','CLOSED')
           AND p.weekly_media_income IS NOT NULL
           AND p.weekly_sponsor_income IS NOT NULL
           AND p.weekly_fixed_overhead IS NOT NULL
         RETURNING p.promotion_id,p.weekly_media_income,p.weekly_sponsor_income,
           p.weekly_fixed_overhead
        )
        INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
         SELECT $1,$2,$3,'PROMOTION_RECURRING_FINANCES',
          jsonb_build_object('promotionId',promotion_id,
           'mediaIncome',weekly_media_income,'sponsorIncome',weekly_sponsor_income,
           'fixedOverhead',weekly_fixed_overhead,
           'net',weekly_media_income+weekly_sponsor_income-weekly_fixed_overhead)
         FROM credited`,[input.worldId,year,week]);
      // Complete original week P&L after ALL monetary movements have been
      // recorded. One indexed current-week aggregate and one batched update;
      // no per-promotion historical ledger scan or added player polling.
      await settleWeeklyPromotionHealth(tx,input.worldId,year,week);
      // Apply accepted renewals only at the end of the paid current term.
      await tx.query(`UPDATE ppw_contracts c SET
          start_week_index=c.expires_week_index+1,
          expires_week_index=c.expires_week_index+(r.proposed_terms->>'termWeeks')::integer,
          date_entitlement=(r.proposed_terms->>'dateEntitlement')::integer,
          remaining_dates=CASE WHEN c.family='EXCLUSIVE' THEN NULL ELSE (r.proposed_terms->>'dateEntitlement')::integer END,
          weekly_guarantee=(r.proposed_terms->>'weeklyGuarantee')::bigint,
          appearance_fee=(r.proposed_terms->>'appearanceFee')::bigint,
          role_expectation=r.proposed_terms->>'roleExpectation',
          creative_control=r.proposed_terms->>'creativeControl',
          signing_bonus=0,revision=c.revision+1
         FROM ppw_contract_renewal_proposals r
         WHERE c.world_id=$1 AND c.expires_week_index=$2 AND c.status='SIGNED'
           AND r.world_id=c.world_id AND r.contract_id=c.contract_id AND r.status='ACCEPTED'
           AND (r.proposed_terms->>'family')=c.family
           AND (r.proposed_terms->>'termWeeks')::integer BETWEEN 1 AND 52
           AND (r.proposed_terms->>'dateEntitlement')::integer BETWEEN 1 AND 104`,
           [input.worldId,weekIndex]);
      // An accepted proposal activates exactly once, never on every rollover.
      await tx.query(`UPDATE ppw_contract_renewal_proposals r SET status='ACTIVATED'
        FROM ppw_contracts c WHERE r.world_id=$1 AND r.status='ACCEPTED'
        AND c.world_id=r.world_id AND c.contract_id=r.contract_id
        AND c.start_week_index=$2+1`,[input.worldId,weekIndex]);
      await tx.query(`UPDATE ppw_contracts c SET status='EXPIRED',revision=revision+1
        WHERE c.world_id=$1 AND c.status='SIGNED' AND c.expires_week_index=$2
        AND NOT EXISTS(SELECT 1 FROM ppw_contract_renewal_proposals r
          WHERE r.world_id=c.world_id AND r.contract_id=c.contract_id
          AND r.status='ACCEPTED')`,[input.worldId,weekIndex]);
      await tx.query(`UPDATE ppw_contract_renewal_proposals r SET status='REJECTED'
        FROM ppw_contracts c WHERE r.world_id=$1 AND r.status='PENDING'
        AND c.world_id=r.world_id AND c.contract_id=r.contract_id
        AND c.status='EXPIRED'`,[input.worldId]);
      // One atomic, certified-week reconciliation. No background polling.
      await settleBackstagePromises(tx,input.worldId,weekIndex);
      await settleBackstageContractDiscussions(tx,input.worldId,weekIndex);
      await settleBackstageMediations(tx,input.worldId,weekIndex);
      await settleBackstageTagFollowThrough(tx,input.worldId,weekIndex);
      await settleBackstageRivalryFollowThrough(tx,input.worldId,weekIndex);
      // Expired unanswered requests become an automatic historical closure,
      // not a forged booker decision or a permanent full inbox.
      await closeUnavailableBackstageRequests(tx,input.worldId,weekIndex+1);
      // One evidence-led partnership pitch may occupy this week's slot.
      await publishBackstageTagPitches(tx,input.worldId,weekIndex+1);
      await publishBackstageRivalryPitches(tx,input.worldId,weekIndex+1);
      await publishBackstageRequests(tx,input.worldId,weekIndex+1);
      await publishBackstageTeamMoments(tx,input.worldId,weekIndex+1);
      await tx.query(
        "INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload) VALUES($1,$2,$3,'WORLD_WEEK_COMPLETED',$4::jsonb)",
        [input.worldId,year,week,JSON.stringify({resolvedPromotions:resolved})],
      );
      return {completedYear:year,completedWeek:week,
        nextYear:moved[0]!.year,nextWeek:moved[0]!.week,resolvedPromotions:resolved};
    },
  });
}
