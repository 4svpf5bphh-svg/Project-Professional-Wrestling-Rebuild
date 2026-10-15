import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {inspectRecordedWeekArbitration} from "./recorded-week-arbitration.js";
import {inspectWeekConflicts} from "./week-conflicts.js";
import {planResourceArbitration} from "../domain/resource-arbitration.js";
import {planResourceRemediations,type RemediationChoice} from "../domain/resource-remediation.js";

export interface ApplyAiRemediationInput {
  worldId:string;requestId:string;expectedRevision:number;
  expectedStateFingerprint:string;showId:string;choice:RemediationChoice;
}

/** Trusted resolver ONLY. No player-facing API.
 * Applies exactly ONE conservative venue/day alternative to a promotion
 * EXPLICITLY marked AI, never to any actively human-controlled promotion.
 * All reads, revalidation, change, ledger and retry receipt are atomic behind
 * the World row lock. No scripted card slot is touched or match outcome chosen.
 */
export async function applyAiWeekRemediation(pool:TransactionPool,input:ApplyAiRemediationInput){
  if(!input.showId||input.showId.length>200||
    !/^[a-f0-9]{64}$/.test(input.expectedStateFingerprint)||
    !Number.isSafeInteger(input.choice.day)||input.choice.day<1||input.choice.day>7||
    !input.choice.venueId||input.choice.venueId.length>200||
    !["CHANGE_VENUE","CHANGE_DAY"].includes(input.choice.kind))
    throw new Error("Invalid AI remediation request");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"APPLY_AI_WEEK_REMEDIATION",
    execute:async(tx,revision)=>{
      const current=await inspectRecordedWeekArbitration(tx,input.worldId);
      if(current.status!=="CURRENT"||
        current.sourceFingerprint!==input.expectedStateFingerprint)
        throw new Error("Arbitration proposal changed; refresh required");
      const venues=await tx.query<{venue_id:string}>(
        "SELECT venue_id FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE' ORDER BY venue_id LIMIT 257",
        [input.worldId],
      );
      if(venues.length>256)throw new Error("Venue catalogue exceeds bounded limit");
      const options=planResourceRemediations(current.report.arbitrationClaims,
        current.outcomes,venues.map(v=>v.venue_id));
      const target=options.shows.find(s=>s.showId===input.showId);
      if(!target)throw new Error("Show has no outstanding arbitration loss");
      if(!target.choices.some(c=>c.kind===input.choice.kind&&c.day===input.choice.day&&
          c.venueId===input.choice.venueId))
        throw new Error("Alternative no longer available");
      const owner=await tx.query<{management_mode:string;controlled:boolean}>(
        `SELECT p.management_mode,EXISTS(
          SELECT 1 FROM ppw_promotion_controls c WHERE c.world_id=p.world_id
            AND c.promotion_id=p.promotion_id AND c.active
        ) AS controlled FROM ppw_promotions p
          WHERE p.world_id=$1 AND p.promotion_id=$2 AND p.lifecycle='ACTIVE'`,
        [input.worldId,target.promotionId],
      );
      if(owner.length!==1||owner[0]!.management_mode!=="AI"||owner[0]!.controlled)
        throw new Error("Human or unassigned promotion cannot be automatically edited");
      const gate=await tx.query<{cleared:boolean;resolved:boolean;certified:boolean}>(
        `SELECT
          EXISTS(SELECT 1 FROM ppw_week_resource_clearances WHERE world_id=$1 AND year=$2 AND week=$3) AS cleared,
          EXISTS(SELECT 1 FROM ppw_show_resolutions WHERE world_id=$1 AND resolved_week_index=$4) AS resolved,
          EXISTS(SELECT 1 FROM ppw_week_resolution_seals WHERE world_id=$1 AND year=$2 AND week=$3) AS certified`,
        [input.worldId,current.year,current.week,(current.year-1)*52+current.week-1],
      );
      if(gate.length!==1||gate[0]!.cleared||gate[0]!.resolved||gate[0]!.certified)
        throw new Error("Cannot remediate after World resolution begins");
      const changed=await tx.query<{draft_id:string}>(
        `UPDATE ppw_booking_drafts SET show_day=$4,venue_id=$5,revision=revision+1
          WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
            AND year=$6 AND week=$7 AND status='SUBMITTED'
            AND show_day=$8 AND venue_id=$9 RETURNING draft_id`,
        [input.worldId,target.showId,target.promotionId,input.choice.day,
          input.choice.venueId,current.year,current.week,target.currentDay,target.currentVenueId],
      );
      if(changed.length!==1)throw new Error("Booked show changed before remediation");
      const after=await inspectWeekConflicts(tx,input.worldId);
      if(after.blockers.some(b=>b.showIds.includes(target.showId)))
        throw new Error("Remediation caused a new conflict; rolled back");
      const rest=planResourceArbitration({
        worldId:input.worldId,worldSeed:after.worldSeed,year:after.year,week:after.week,
      },after.arbitrationClaims);
      if(rest.outcomes.length>256)throw new Error("Remaining arbitration exceeds limit");
      // The one-row current proposal is refreshed to the next revision so
      // subsequent AI losers can be handled without first-to-click priority.
      // The append-only ledger below retains every committed decision.
      if(rest.outcomes.length){
        const replaced=await tx.query<{world_id:string}>(
          `UPDATE ppw_week_arbitration_proposals SET
            source_revision=$4,state_fingerprint=$5,claim_fingerprint=$6,
            proposal=$7::jsonb,disputed_count=$8
           WHERE world_id=$1 AND year=$2 AND week=$3 RETURNING world_id`,
          [input.worldId,current.year,current.week,revision,after.stateFingerprint,
            rest.fingerprint,JSON.stringify(rest.outcomes),rest.outcomes.length],
        );
        if(replaced.length!==1)throw new Error("Arbitration continuation failed");
      }else{
        await tx.query(
          "DELETE FROM ppw_week_arbitration_proposals WHERE world_id=$1 AND year=$2 AND week=$3",
          [input.worldId,current.year,current.week],
        );
      }
      await tx.query(
        `INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
         VALUES($1,$2,$3,'AI_BOOKING_REMEDIATED',$4::jsonb)`,
        [input.worldId,current.year,current.week,JSON.stringify({
          promotionId:target.promotionId,showId:target.showId,previousDay:target.currentDay,
          previousVenueId:target.currentVenueId,choice:input.choice,
          sourceFingerprint:current.sourceFingerprint,
          remainingDisputes:rest.outcomes.length,author:"AI_WORLD_RESOLVER",
        })],
      );
      return {year:current.year,week:current.week,
        promotionId:target.promotionId,showId:target.showId,
        choice:input.choice,remainingDisputes:rest.outcomes.length};
    },
  });
}
