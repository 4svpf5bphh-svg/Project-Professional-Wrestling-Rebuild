import type {TransactionPool} from "./transaction.js";
import {applyWorldCommand} from "./world-commands.js";
import {chooseStaffFallbackSchedule} from "../domain/staff-show-schedule.js";
import {validatePreparedDraft,type ReadyDraftEvidence} from "../domain/prepared-show.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {uniqueShowAppearances} from "../domain/appearance-policy.js";
import {inspectWeekConflicts} from "./week-conflicts.js";

export interface StaffScheduleFallbackInput{
  worldId:string;requestId:string;expectedRevision:number;promotionId:string;
}

/** Staff may recover MISSING scheduling only, for a pre-lock opted-in owner
 * and an existing, sufficiently authored draft. Not a generic show generator.
 * No card slots, scripted winners or contract dates are ever changed.
 */
export async function applyStaffScheduleFallback(pool:TransactionPool,input:StaffScheduleFallbackInput){
  if(!input.promotionId||input.promotionId.length>200)throw new Error("Invalid promotion");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:"system",requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"APPLY_STAFF_SCHEDULE_FALLBACK",
    execute:async tx=>{
      const worlds=await tx.query<{year:number;week:number;phase:string;seed:string|number}>(
        "SELECT year,week,phase,seed FROM ppw_worlds WHERE world_id=$1",[input.worldId],
      );
      if(worlds.length!==1||worlds[0]!.phase!=="RESOLVING")
        throw new Error("Staff fallback requires World resolution");
      const {year,week}=worlds[0]!;
      const checkpoint=await tx.query<{completed:boolean;cleared:boolean;resolved:boolean}>(
        `SELECT
          EXISTS(SELECT 1 FROM ppw_week_prepared_finalizations WHERE world_id=$1 AND year=$2 AND week=$3) AS completed,
          EXISTS(SELECT 1 FROM ppw_week_resource_clearances WHERE world_id=$1 AND year=$2 AND week=$3) AS cleared,
          EXISTS(SELECT 1 FROM ppw_show_resolutions WHERE world_id=$1 AND resolved_week_index=(($2::integer-1)*52+$3::integer-1)) AS resolved`,
        [input.worldId,year,week],
      );
      if(checkpoint.length!==1||!checkpoint[0]!.completed||checkpoint[0]!.cleared||checkpoint[0]!.resolved)
        throw new Error("Staff fallback must follow prepared handoff and precede show resolution");
      const owners=await tx.query<{
        show_id:string|null;controller_player_id:string|null;owner_player_id:string|null;
        delegated:boolean|null;mode:string;status:string;
      }>(
        `SELECT a.show_id,a.controller_player_id,s.owner_player_id,
            s.allow_unfinished_fallback AS delegated,p.management_mode AS mode,a.status
         FROM ppw_week_continuity_assessments a
         JOIN ppw_promotions p ON p.world_id=a.world_id AND p.promotion_id=a.promotion_id
         LEFT JOIN ppw_staff_continuity_settings s ON s.world_id=a.world_id AND s.promotion_id=a.promotion_id
         JOIN ppw_promotion_controls c ON c.world_id=a.world_id AND c.promotion_id=a.promotion_id
            AND c.player_id=a.controller_player_id AND c.active
         JOIN ppw_memberships m ON m.world_id=c.world_id AND m.player_id=c.player_id AND m.status='ACTIVE'
        WHERE a.world_id=$1 AND a.year=$2 AND a.week=$3 AND a.promotion_id=$4
          AND p.lifecycle='ACTIVE'`,
        [input.worldId,year,week,input.promotionId],
      );
      if(owners.length!==1 || owners[0]!.status!=="STAFF_FALLBACK_ELIGIBLE"||
        owners[0]!.controller_player_id!==owners[0]!.owner_player_id||
        owners[0]!.delegated!==true || owners[0]!.show_id===null)
        throw new Error("Staff fallback not delegated for this unfinished show");
      const showId=owners[0]!.show_id!;
      const drafts=await tx.query<{
        show_day:number|null;venue_id:string|null;draft_id:string;promotion_id:string;
      }>(
        `SELECT draft_id,promotion_id,show_day,venue_id FROM ppw_booking_drafts
          WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
            AND year=$4 AND week=$5 AND status='DRAFT'`,
        [input.worldId,showId,input.promotionId,year,week],
      );
      if(drafts.length!==1)throw new Error("Missing or previously submitted staff draft");
      const draft=drafts[0]!;
      // Fully scheduled but unconfirmed work is NOT staff fallback territory.
      if(draft.show_day!==null&&draft.venue_id!==null)
        throw new Error("Player-authored complete scheduling cannot be overridden");
      const slots=await tx.query<{
        slot_id:string;position:number;kind:string;payload:unknown;
      }>(
        "SELECT slot_id,position,kind,payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2 ORDER BY position LIMIT 101",
        [input.worldId,showId],
      );
      if(!slots.length||slots.length>100||!slots.some(s=>s.kind==="MATCH"))
        throw new Error("Staff fallback needs a completed player-authored match card");
      let cast:ReturnType<typeof uniqueShowAppearances>;
      try{cast=uniqueShowAppearances(slots.flatMap(s=>readCardParticipants(s.payload)));}
      catch{throw new Error("Staff fallback card participants invalid");}
      if(cast.length<2||cast.length>100)
        throw new Error("Staff fallback requires a complete booked wrestling roster");
      const venueRows=await tx.query<{venue_id:string}>(
        "SELECT venue_id FROM ppw_venues WHERE world_id=$1 AND status='ACTIVE' ORDER BY venue_id LIMIT 257",
        [input.worldId],
      );
      if(venueRows.length>256)throw new Error("World venue catalogue too large");
      const taken=await tx.query<{
        show_id:string;day:number;venue_id:string;slot_payload:unknown|null;
      }>(
        `SELECT d.draft_id AS show_id,d.show_day AS day,d.venue_id,
                 s.payload AS slot_payload
          FROM ppw_booking_drafts d JOIN ppw_promotions p
            ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
          LEFT JOIN ppw_card_slots s ON s.world_id=d.world_id AND s.draft_id=d.draft_id
          WHERE d.world_id=$1 AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
            AND p.lifecycle='ACTIVE'
          ORDER BY d.draft_id,s.position LIMIT 20001`,
        [input.worldId,year,week],
      );
      if(taken.length>20000)throw new Error("Submitted card size exceeds bound");
      const existing=new Map<string,{showId:string;day:number;venueId:string;personIds:string[]}>();
      for(const row of taken){
        let booking=existing.get(row.show_id);
        if(!booking){booking={showId:row.show_id,day:row.day,venueId:row.venue_id,personIds:[]};
          existing.set(row.show_id,booking);}
        if(row.slot_payload!==null){
          try{booking.personIds.push(...readCardParticipants(row.slot_payload).map(x=>x.personId));}
          catch{throw new Error("Existing World show has invalid participants");}
        }
      }
      const option=chooseStaffFallbackSchedule({
        worldId:input.worldId,worldSeed:String(worlds[0]!.seed),year,week,
        promotionId:input.promotionId,showId,
        preferredDay:draft.show_day,preferredVenueId:draft.venue_id,
        personIds:cast.map(x=>x.personId),availableVenueIds:venueRows.map(x=>x.venue_id),
        bookedShows:[...existing.values()],
      });
      if(!option)throw new Error("No conflict-free staff schedule available");
      const evidence:ReadyDraftEvidence={
        worldId:input.worldId,promotionId:input.promotionId,showId,year,week,
        day:option.day,venueId:option.venueId,slots,
      };
      const invalid=validatePreparedDraft(evidence);
      if(invalid)throw new Error("Staff may not run an invalid match card: "+invalid);
      const changed=await tx.query<{draft_id:string}>(
        `UPDATE ppw_booking_drafts
            SET show_day=$4,venue_id=$5,status='SUBMITTED',
                booking_origin='STAFF_FALLBACK',revision=revision+1
           WHERE world_id=$1 AND draft_id=$2 AND promotion_id=$3
             AND year=$6 AND week=$7 AND status='DRAFT'
           RETURNING draft_id`,
        [input.worldId,showId,input.promotionId,option.day,option.venueId,year,week],
      );
      if(changed.length!==1)throw new Error("Staff draft changed before atomic submission");
      const report=await inspectWeekConflicts(tx,input.worldId);
      if(report.blockers.some(b=>b.showIds.includes(showId)))
        throw new Error("Staff schedule cannot pass World eligibility checks");
      await tx.query(
        `INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
           VALUES($1,$2,$3,'DELEGATED_STAFF_SCHEDULE',$4::jsonb)`,
        [input.worldId,year,week,JSON.stringify({
          promotionId:input.promotionId,showId,
          day:option.day,venueId:option.venueId,
          originalDay:draft.show_day,originalVenueId:draft.venue_id,
          authority:"PRE_LOCK_OWNER_DELEGATION",
        })],
      );
      return {year,week,promotionId:input.promotionId,showId,
        day:option.day,venueId:option.venueId,
        authoredCardPreserved:true};
    },
  });
}
