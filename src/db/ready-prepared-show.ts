import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {validatePreparedDraft,preparedDraftFingerprint,type ReadyDraftEvidence} from "../domain/prepared-show.js";
import {snapshotPreparedShowDemand} from "./prepared-show-demand.js";
import {creativeReviewsInTransaction,creativeApprovalRequired} from "./match-creative-consent.js";

export interface MarkPreparedShowInput {
  worldId:string;playerId:string;requestId:string;expectedRevision:number;
  promotionId:string;showId:string;confirmReadyToRun:true;
}
/** Explicit authenticated player confirmation BEFORE the single deadline.
 * This does not submit the show, spend dates or change authored outcomes.
 */
export async function markPreparedShowReady(pool:TransactionPool,input:MarkPreparedShowInput){
  if(!input.promotionId||input.promotionId.length>200||
     !input.showId||input.showId.length>200||input.confirmReadyToRun!==true)
     throw new Error("Player must explicitly confirm their prepared show");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:input.playerId,
    requestId:input.requestId,expectedRevision:input.expectedRevision,
    commandType:"MARK_PREPARED_SHOW_READY",requiresOpenWeek:true,
    execute:async tx=>{
      const control=await tx.query<{draft_id:string;year:number;week:number;show_day:number|null;
        venue_id:string|null;show_economics_enabled:boolean}>(
        `SELECT d.draft_id,d.year,d.week,d.show_day,d.venue_id,w.show_economics_enabled
          FROM ppw_booking_drafts d
          JOIN ppw_worlds w ON w.world_id=d.world_id
          JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
          JOIN ppw_promotion_controls c ON c.world_id=d.world_id AND c.promotion_id=d.promotion_id
          JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id
         WHERE d.world_id=$1 AND d.draft_id=$2 AND d.promotion_id=$3
           AND d.status='DRAFT' AND p.lifecycle='ACTIVE'
           AND (d.year-1)*52+d.week-1 BETWEEN (w.year-1)*52+w.week-1 AND (w.year-1)*52+w.week+5
           AND c.player_id=$4 AND c.active AND m.status='ACTIVE'`,
        [input.worldId,input.showId,input.promotionId,input.playerId],
      );
      if(control.length!==1)throw new Error("Show is not an editable draft in the advance booking window");
      const draft=control[0]!;
      const slots=await tx.query<{slot_id:string;position:number;kind:string;payload:unknown}>(
        `SELECT slot_id,position,kind,payload FROM ppw_card_slots
          WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101`,
        [input.worldId,input.showId],
      );
      const evidence:ReadyDraftEvidence={
        worldId:input.worldId,promotionId:input.promotionId,showId:input.showId,
        year:draft.year,week:draft.week,day:draft.show_day,venueId:draft.venue_id,slots,
      };
      const bad=validatePreparedDraft(evidence);
      if(bad)throw new Error("Prepared show is incomplete: "+bad);
      const concerns=await creativeReviewsInTransaction(tx,input.worldId,[{
       showId:input.showId,promotionId:input.promotionId,
       weekIndex:(draft.year-1)*52+draft.week-1,slots
      }]);
      if(creativeApprovalRequired(concerns).length)
       throw new Error("A wrestler's creative agreement is required before confirming the card");
      const venue=await tx.query<{venue_id:string}>(
        "SELECT venue_id FROM ppw_venues WHERE world_id=$1 AND venue_id=$2 AND status='ACTIVE'",
        [input.worldId,evidence.venueId],
      );
      if(venue.length!==1)throw new Error("Prepared show venue unavailable");
      const snapshot=draft.show_economics_enabled?
        await snapshotPreparedShowDemand(tx,input.worldId,input.promotionId,input.showId,slots):undefined;
      if(snapshot)evidence.commercial=snapshot;
      const fingerprint=preparedDraftFingerprint(evidence);
      await tx.query(
        `UPDATE ppw_booking_drafts SET lock_ready_by_player_id=$3,
           lock_ready_fingerprint=$4,
           booking_expected_demand=$5,booking_ticket_yield=$6,
           booking_snapshot_fingerprint=$7,revision=revision+1
          WHERE world_id=$1 AND draft_id=$2 AND status='DRAFT'`,
        [input.worldId,input.showId,input.playerId,fingerprint,
         snapshot?.expectedDemand??null,snapshot?.ticketYield??null,
         snapshot?fingerprint:null],
      );
      return {showId:input.showId,promotionId:input.promotionId,
        preparedForLock:true,fingerprint,
        ...(snapshot?{expectedDemand:snapshot.expectedDemand,
         ticketYield:snapshot.ticketYield}:{})};
    },
  });
}
