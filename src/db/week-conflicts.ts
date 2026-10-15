import type {SqlRows} from "./world-operations.js";
import {readCardParticipants} from "../domain/card-participants.js";
import {uniqueShowAppearances} from "../domain/appearance-policy.js";

export type WeekBlockerCode =
  | "MISSING_SHOW" | "MISSING_SCHEDULE" | "EMPTY_CARD" | "INVALID_CARD"
  | "VENUE_DAY_CONFLICT" | "WRESTLER_DAY_CONFLICT";
export interface WeekBlocker {
  code:WeekBlockerCode;
  promotionIds:string[];
  showIds:string[];
  resourceId?:string;
  day?:number;
}
export interface WeekConflictReport {
  year:number; week:number; activePromotions:number; submittedShows:number;
  inspectedSlots:number; blockers:WeekBlocker[];
  /** Only checks coverage, schedule fields and day collisions, NOT all
   * talent/venue contracts, creative approvals or future AI show fallbacks. */
  provisionalClear:boolean;
}

/** Read-only server-side inspection. Must be called inside the trusted World
 * transaction, holding the World row lock. Never expose other promotions'
 * confidential cards in a player-facing response.
 *
 * Two bounded indexed queries after the World lock read. This runs once at
 * lock-time, never on every screen refresh and never per player/promotion.
 */
export async function inspectWeekConflicts(tx:SqlRows,worldId:string):Promise<WeekConflictReport> {
  if(!worldId || worldId.length>200) throw new Error("Invalid World");
  const states=await tx.query<{year:number;week:number;phase:string}>(
    "SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId],
  );
  if(states.length!==1 || states[0]!.phase!=="RESOLVING") throw new Error("World is not resolving");
  const {year,week}=states[0]!;
  if(!Number.isSafeInteger(year)||year<1 || !Number.isSafeInteger(week)||week<1||week>52)
    throw new Error("Invalid World clock");
  const promotions=await tx.query<{
    promotion_id:string;draft_id:string|null;show_day:number|null;venue_id:string|null;
  }>(
    `SELECT p.promotion_id,d.draft_id,d.show_day,d.venue_id
       FROM ppw_promotions p LEFT JOIN ppw_booking_drafts d
         ON d.world_id=p.world_id AND d.promotion_id=p.promotion_id
           AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
      WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
      ORDER BY p.promotion_id LIMIT 129`,
    [worldId,year,week],
  );
  if(promotions.length>128) throw new Error("World has too many active promotions for weekly inspection");
  const slots=await tx.query<{draft_id:string;payload:unknown}>(
    `SELECT s.draft_id,s.payload FROM ppw_card_slots s
        JOIN ppw_booking_drafts d ON d.world_id=s.world_id AND d.draft_id=s.draft_id
        JOIN ppw_promotions p ON p.world_id=d.world_id AND p.promotion_id=d.promotion_id
       WHERE d.world_id=$1 AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
         AND p.lifecycle='ACTIVE'
       ORDER BY s.draft_id,s.position LIMIT 10001`,
    [worldId,year,week],
  );
  if(slots.length>10000) throw new Error("World card slots exceed weekly inspection capacity");
  const blockers:WeekBlocker[]=[];
  const slotMap=new Map<string,unknown[]>();
  for(const slot of slots) {
    const existing=slotMap.get(slot.draft_id)??[];
    existing.push(slot.payload);
    slotMap.set(slot.draft_id,existing);
  }
  // A booking may be submitted early. Arrival order never resolves a conflict.
  const venues=new Map<string,{promotionId:string;showId:string;day:number;venueId:string}>();
  const wrestlers=new Map<string,{promotionId:string;showId:string;day:number;personId:string}>();
  let submittedShows=0;
  for(const p of promotions){
    if(p.draft_id===null){
      blockers.push({code:"MISSING_SHOW",promotionIds:[p.promotion_id],showIds:[]});
      continue;
    }
    const showId=p.draft_id;
    submittedShows++;
    if(p.show_day===null || !Number.isInteger(p.show_day)||p.show_day<1||p.show_day>7
      || typeof p.venue_id!=="string"||p.venue_id.trim().length===0){
      blockers.push({code:"MISSING_SCHEDULE",promotionIds:[p.promotion_id],showIds:[showId]});
    } else {
      const key=p.show_day+"\u0000"+p.venue_id;
      const prev=venues.get(key);
      if(prev && prev.promotionId!==p.promotion_id) blockers.push({
        code:"VENUE_DAY_CONFLICT",promotionIds:[prev.promotionId,p.promotion_id],
        showIds:[prev.showId,showId],resourceId:p.venue_id,day:p.show_day,
      });
      else if(!prev) venues.set(key,{promotionId:p.promotion_id,showId,day:p.show_day,venueId:p.venue_id});
    }
    const payloads=slotMap.get(showId)??[];
    if(!payloads.length){blockers.push({code:"EMPTY_CARD",promotionIds:[p.promotion_id],showIds:[showId]});continue;}
    if(payloads.length>100){blockers.push({code:"INVALID_CARD",promotionIds:[p.promotion_id],showIds:[showId]});continue;}
    let appearances:ReturnType<typeof uniqueShowAppearances>;
    try {
      appearances=uniqueShowAppearances(payloads.flatMap(readCardParticipants));
    }catch{
      blockers.push({code:"INVALID_CARD",promotionIds:[p.promotion_id],showIds:[showId]});
      continue;
    }
    if(p.show_day===null || p.show_day<1 || p.show_day>7)continue;
    for(const a of appearances) {
      const key=p.show_day+"\u0000"+a.personId;
      const prev=wrestlers.get(key);
      if(prev && prev.promotionId!==p.promotion_id)blockers.push({
        code:"WRESTLER_DAY_CONFLICT",promotionIds:[prev.promotionId,p.promotion_id],
        showIds:[prev.showId,showId],resourceId:a.personId,day:p.show_day,
      });
      else if(!prev)wrestlers.set(key,{promotionId:p.promotion_id,showId,day:p.show_day,personId:a.personId});
    }
  }
  return {year,week,activePromotions:promotions.length,submittedShows,
    inspectedSlots:slots.length,blockers,
    provisionalClear:promotions.length>0 && blockers.length===0};
}
