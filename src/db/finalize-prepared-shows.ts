import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {validatePreparedDraft,preparedDraftFingerprint,type ReadyDraftEvidence} from "../domain/prepared-show.js";

export interface FinalizePreparedWorldShowsInput {
  worldId:string;requestId:string;expectedRevision:number;
}
type Candidate={
  draft_id:string;promotion_id:string;year:number;week:number;
  show_day:number|null;venue_id:string|null;
  market_id:string|null;event_type:"REGULAR"|"MAJOR"|null;
  ticket_strategy:"ACCESSIBLE"|"STANDARD"|"PREMIUM"|"PRESTIGE"|null;
  booking_expected_demand:number|null;booking_ticket_yield:string|null;
  booking_snapshot_fingerprint:string|null;show_economics_enabled:boolean;
  lock_ready_fingerprint:string;lock_ready_by_player_id:string;
  controller_player_id:string|null;assessment_owner:string|null;
};
/** Runs ONCE after the one weekly Lock and its continuity snapshot, before
 * RESOLVING. Never grants extra player editing time or invents creative.
 * A changed/incomplete draft is left untouched for explicit review.
 */
export async function finalizePreparedWorldShows(pool:TransactionPool,input:FinalizePreparedWorldShowsInput){
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,
    commandType:"FINALIZE_PREPARED_WORLD_SHOWS",
    execute:async tx=>{
      const world=await tx.query<{year:number;week:number;phase:string}>(
        "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[input.worldId],
      );
      if(world.length!==1 || world[0]!.phase!=="LOCKED")throw new Error("World must be locked before prepared show finalisation");
      const {year,week}=world[0]!;
      const checkpoint=await tx.query<{count:string}>(
        "SELECT count(*)::text AS count FROM ppw_week_continuity_assessments WHERE world_id=$1 AND year=$2 AND week=$3",
        [input.worldId,year,week],
      );
      if(checkpoint.length!==1||Number(checkpoint[0]!.count)<1)
        throw new Error("Continuity assessment required before prepared show finalisation");
      const prior=await tx.query<{world_id:string}>(
        "SELECT world_id FROM ppw_week_prepared_finalizations WHERE world_id=$1 AND year=$2 AND week=$3",
        [input.worldId,year,week],
      );
      if(prior.length)throw new Error("Prepared show finalisation already completed");
      const candidates=await tx.query<Candidate>(
        `SELECT d.draft_id,d.promotion_id,d.year,d.week,d.show_day,d.venue_id,
             d.market_id,d.event_type,d.ticket_strategy,d.booking_expected_demand,
             d.booking_ticket_yield::text,d.booking_snapshot_fingerprint,
             w.show_economics_enabled,
             d.lock_ready_fingerprint,d.lock_ready_by_player_id,
             m.player_id AS controller_player_id,a.controller_player_id AS assessment_owner
          FROM ppw_booking_drafts d
          JOIN ppw_worlds w ON w.world_id=d.world_id
          JOIN ppw_week_continuity_assessments a
            ON a.world_id=d.world_id AND a.promotion_id=d.promotion_id
            AND a.year=d.year AND a.week=d.week
            AND (a.show_id=d.draft_id OR d.booking_class='PREMIUM')
          LEFT JOIN ppw_promotion_controls c ON c.world_id=d.world_id
            AND c.promotion_id=d.promotion_id AND c.active
          LEFT JOIN ppw_memberships m ON m.world_id=c.world_id
            AND m.player_id=c.player_id AND m.status='ACTIVE'
          JOIN ppw_promotions p ON p.world_id=d.world_id
            AND p.promotion_id=d.promotion_id AND p.lifecycle='ACTIVE'
          WHERE d.world_id=$1 AND d.year=$2 AND d.week=$3
            AND d.status='DRAFT' AND d.lock_ready_fingerprint IS NOT NULL
            AND (a.status='PREPARED_DRAFT' OR d.booking_class='PREMIUM')
          ORDER BY d.promotion_id,d.booking_class DESC LIMIT 257`,
        [input.worldId,year,week],
      );
      if(candidates.length>256)throw new Error("Prepared show candidate limit exceeded");
      const slots=candidates.length?await tx.query<{
        draft_id:string;slot_id:string;position:number;kind:string;payload:unknown;
      }>(
        `SELECT s.draft_id,s.slot_id,s.position,s.kind,s.payload
           FROM ppw_card_slots s WHERE s.world_id=$1 AND s.draft_id=ANY($2::text[])
           ORDER BY s.draft_id,s.position LIMIT 20001`,
        [input.worldId,candidates.map(c=>c.draft_id)],
      ):[];
      if(slots.length>20000)throw new Error("Prepared show slots exceed bounded limit");
      const available=candidates.length?await tx.query<{venue_id:string}>(
        "SELECT venue_id FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE' AND venue_id=ANY($2::text[])",
        [input.worldId,[...new Set(candidates.map(c=>c.venue_id).filter((x):x is string=>x!==null))]],
      ):[];
      const venues=new Set(available.map(x=>x.venue_id));
      const byShow=new Map<string,Array<(typeof slots)[number]>>();
      for(const slot of slots){
        const list=byShow.get(slot.draft_id)??[];
        list.push(slot);byShow.set(slot.draft_id,list);
      }
      const eligible:string[]=[];
      const flagged:Array<{showId:string;reason:string}>=[];
      for(const d of candidates){
        const evidence:ReadyDraftEvidence={
          worldId:input.worldId,promotionId:d.promotion_id,showId:d.draft_id,
          year:d.year,week:d.week,day:d.show_day,venueId:d.venue_id,
          slots:(byShow.get(d.draft_id)??[]).map(({slot_id,position,kind,payload})=>({
            slot_id,position,kind,payload,
          })),
        };
        const missingCommerce=d.show_economics_enabled&&(
          !d.market_id||!d.ticket_strategy||!d.event_type||
          d.booking_expected_demand===null||d.booking_ticket_yield===null||
          !d.booking_snapshot_fingerprint);
        if(d.show_economics_enabled&&!missingCommerce)
          evidence.commercial={marketId:d.market_id!,ticketStrategy:d.ticket_strategy!,
            eventType:d.event_type!,expectedDemand:d.booking_expected_demand!,
            ticketYield:Number(d.booking_ticket_yield)};
        const error=validatePreparedDraft(evidence);
        const permitted=d.controller_player_id!==null&&
          d.controller_player_id===d.assessment_owner &&
          d.lock_ready_by_player_id===d.controller_player_id;
        const reason=!permitted?"OWNER_CHANGED":error??(
          missingCommerce?"MISSING_COMMERCIAL_SNAPSHOT":
          !venues.has(d.venue_id??"")?"VENUE_UNAVAILABLE":
          d.show_economics_enabled&&d.booking_snapshot_fingerprint!==d.lock_ready_fingerprint?
            "DRAFT_CHANGED":
          preparedDraftFingerprint(evidence)!==d.lock_ready_fingerprint?"DRAFT_CHANGED":null
        );
        if(reason)flagged.push({showId:d.draft_id,reason});
        else eligible.push(d.draft_id);
      }
      const submitted=eligible.length?await tx.query<{draft_id:string}>(
        `UPDATE ppw_booking_drafts SET status='SUBMITTED',revision=revision+1
           WHERE world_id=$1 AND draft_id=ANY($2::text[]) AND status='DRAFT'
             RETURNING draft_id`,
        [input.worldId,eligible],
      ):[];
      if(submitted.length!==eligible.length)throw new Error("Draft changed before atomic finalisation");
      await tx.query(
        `INSERT INTO ppw_week_prepared_finalizations
          (world_id,year,week,submitted_count,review_count,command_request_id)
          VALUES($1,$2,$3,$4,$5,$6)`,
        [input.worldId,year,week,eligible.length,flagged.length,input.requestId],
      );
      await tx.query(
        `INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
           VALUES($1,$2,$3,'PREPARED_SHOW_LOCK_HANDOFF',$4::jsonb)`,
        [input.worldId,year,week,JSON.stringify({submittedShowIds:eligible,review:flagged})],
      );
      return {year,week,submittedShowIds:eligible,review:flagged};
    },
  });
}
