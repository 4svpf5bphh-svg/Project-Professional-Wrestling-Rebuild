import type { TransactionPool } from "./transaction.js";
import { applyWorldCommand } from "./world-commands.js";
import { uniqueShowAppearances } from "../domain/appearance-policy.js";
import { appearancesFromSlots } from "../domain/card-participants.js";

export interface ConsumeAppearancesInput {
  worldId:string; playerId:string; promotionId:string; showId:string;
  requestId:string; expectedRevision:number;
}

/** Atomic date consumption with World revision + idempotency receipt.
 * Must only be invoked by the trusted World resolution process after a
 * validated submitted show; never expose as a player-triggered HTTP action.
 */
export async function consumeShowAppearances(pool:TransactionPool,input:ConsumeAppearancesInput) {
  if (!input.showId || input.showId.length>200) throw new Error("Invalid show");
  return applyWorldCommand(pool,{
    worldId:input.worldId,playerId:input.playerId,requestId:input.requestId,
    expectedRevision:input.expectedRevision,commandType:"CONSUME_SHOW_APPEARANCES",
    execute:async tx=>{
      // The World clock, never a caller-supplied week, authorizes consumption.
      const clocks=await tx.query<{year:number;week:number;phase:string}>(
        "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",
        [input.worldId],
      );
      if (clocks.length!==1 || clocks[0]!.phase!=="RESOLVING") throw new Error("World is not resolving");
      const {year,week}=clocks[0]!;
      if (!Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52) throw new Error("Invalid World clock");
      const weekIndex=(year-1)*52+week-1;
      if (!Number.isSafeInteger(weekIndex)) throw new Error("Invalid World week");
      // Check submitted status, correct World week and prior resolution
      // together, avoiding a separate existence round-trip.
      const submitted=await tx.query<{draft_id:string;already_resolved:boolean;resources_cleared:boolean}>(
        `SELECT d.draft_id,(r.show_id IS NOT NULL) AS already_resolved,
                  (clearance.world_id IS NOT NULL) AS resources_cleared
           FROM ppw_booking_drafts d LEFT JOIN ppw_show_resolutions r
             ON r.world_id=d.world_id AND r.show_id=d.draft_id
           LEFT JOIN ppw_week_resource_clearances clearance
             ON clearance.world_id=d.world_id AND clearance.year=d.year AND clearance.week=d.week
          WHERE d.world_id=$1 AND d.draft_id=$2 AND d.promotion_id=$3
            AND d.status='SUBMITTED' AND ((d.year-1)*52+d.week-1)=$4`,
        [input.worldId,input.showId,input.promotionId,weekIndex],
      );
      if(submitted.length!==1) throw new Error("Show is not a submitted booking for this World week");
      if(!submitted[0]!.resources_cleared) throw new Error("World week resource clearance required");
      if(submitted[0]!.already_resolved) throw new Error("Show already resolved");
      const slots=await tx.query<{payload:unknown}>(
        "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2 ORDER BY position",
        [input.worldId,input.showId],
      );
      if(slots.length===0) throw new Error("Submitted show has no card slots");
      const appearances=uniqueShowAppearances(appearancesFromSlots(slots.map(s=>s.payload)));
      if(appearances.length>100) throw new Error("Too many appearances");
      // Batch-read at most 100 contracts using the composite World/contract key.
      // Never run a pair of queries per wrestler (N+1) during a show.
      const people=appearances.map(a=>a.personId);
      const ids=appearances.map(a=>a.contractId);
      let charged=0;
      if(appearances.length>0) {
        const contracts=await tx.query<{
          person_id:string;contract_id:string;family:string|null;
          status:string|null;remaining_dates:number|null;expires_week_index:number|null;start_week_index:number|null;appearance_fee:string|number|null;
        }>(
          `SELECT booked.person_id,booked.contract_id,c.family,c.status,
                  c.remaining_dates,c.expires_week_index,c.start_week_index,c.appearance_fee
             FROM unnest($3::text[],$4::text[]) AS booked(person_id,contract_id)
             LEFT JOIN ppw_contracts c ON c.world_id=$1
               AND c.promotion_id=$2 AND c.person_id=booked.person_id
               AND c.contract_id=booked.contract_id`,
          [input.worldId,input.promotionId,people,ids],
        );
        if(contracts.length!==appearances.length) throw new Error("Invalid contract batch");
        const finite:string[]=[];
        let appearanceFees=0;
        for(const c of contracts) {
          const valid= c.status==="SIGNED"
            && typeof c.expires_week_index==="number" && c.expires_week_index>=weekIndex
            && typeof c.start_week_index==="number" && c.start_week_index<=weekIndex
            && (c.family==="EXCLUSIVE"
              || ((c.family==="ONE_OFF" || c.family==="LIMITED_NON_EXCLUSIVE")
                  && typeof c.remaining_dates==="number" && c.remaining_dates>0));
          if(!valid) throw new Error("Contract unavailable for show: "+c.contract_id);
          if(c.family!=="EXCLUSIVE" && c.remaining_dates!==null) finite.push(c.contract_id);
          appearanceFees+=Number(c.appearance_fee??0);
          if(!Number.isSafeInteger(appearanceFees)||appearanceFees<0)throw new Error("Invalid appearance fee");
        }
        if(appearanceFees>0){
          await tx.query("UPDATE ppw_promotions SET cash=cash-$3 WHERE world_id=$1 AND promotion_id=$2",[input.worldId,input.promotionId,appearanceFees]);
          await tx.query("INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload) VALUES($1,$2,$3,'CONTRACT_APPEARANCE_FEES',jsonb_build_object('promotionId',$4::text,'showId',$5::text,'amount',$6::bigint))",[input.worldId,year,week,input.promotionId,input.showId,appearanceFees]);
        }
        if(finite.length>0) {
          const updated=await tx.query<{contract_id:string}>(
            `UPDATE ppw_contracts SET remaining_dates=remaining_dates-1
              WHERE world_id=$1 AND promotion_id=$2
                AND contract_id=ANY($3::text[]) AND status='SIGNED'
                AND remaining_dates>0 AND expires_week_index>=$4
                AND family IN ('ONE_OFF','LIMITED_NON_EXCLUSIVE','EXCLUSIVE')
              RETURNING contract_id`,
            [input.worldId,input.promotionId,finite,weekIndex],
          );
          // An unexpected concurrent contract change aborts the WHOLE
          // World transaction, including every date decrement.
          if(updated.length!==finite.length) throw new Error("Contract availability changed during resolution");
          charged=updated.length;
        }
      }
      await tx.query(
        "INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [input.worldId,input.showId,input.promotionId,weekIndex,input.requestId,appearances.length,charged],
      );
      return {performers:appearances.length,datesCharged:charged};
    },
  });
}
