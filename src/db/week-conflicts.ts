import type {SqlRows} from "./world-operations.js";
import {createHash} from "node:crypto";
import {readCardParticipants} from "../domain/card-participants.js";
import {uniqueShowAppearances} from "../domain/appearance-policy.js";
import type {ResourceClaim} from "../domain/resource-arbitration.js";

export type WeekBlockerCode =
  | "MISSING_SHOW" | "MISSING_SCHEDULE" | "EMPTY_CARD" | "INVALID_CARD"
  | "VENUE_DAY_CONFLICT" | "WRESTLER_DAY_CONFLICT"
  | "VENUE_UNAVAILABLE" | "WRESTLER_UNAVAILABLE"
  | "CONTRACT_UNAVAILABLE" | "WRESTLER_WEEK_CAPACITY";
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
  /** Internal server-only arbitration inputs, never a player read model. */
  worldSeed:string;arbitrationClaims:ResourceClaim[];
  /** Hash over all current-week card/venue/contract evidence, not claims only. */
  stateFingerprint:string;
  /** Strict schedule, venue registry, signed date entitlement and capacity
   * checks; NOT creative approvals or future AI/staff show fallbacks. */
  provisionalClear:boolean;
}

/** Read-only server-side inspection. Must be called inside the trusted World
 * transaction, holding the World row lock. Never expose other promotions'
 * confidential cards in a player-facing response.
 *
 * At most four indexed, bounded queries after the World clock lookup.
 * This runs at weekly resolution, never per player/promotion screen.
 */
export async function inspectWeekConflicts(tx:SqlRows,worldId:string):Promise<WeekConflictReport> {
  if(!worldId || worldId.length>200) throw new Error("Invalid World");
  const states=await tx.query<{year:number;week:number;phase:string;seed:string|number}>(
    "SELECT year,week,phase,seed FROM ppw_worlds WHERE world_id=$1 FOR UPDATE",[worldId],
  );
  if(states.length!==1 || states[0]!.phase!=="RESOLVING") throw new Error("World is not resolving");
  const {year,week}=states[0]!;
  const worldSeed=String(states[0]!.seed);
  if(!Number.isSafeInteger(year)||year<1 || !Number.isSafeInteger(week)||week<1||week>52)
    throw new Error("Invalid World clock");
  const promotions=await tx.query<{
    promotion_id:string;draft_id:string|null;show_day:number|null;venue_id:string|null;already_resolved:boolean;
  }>(
    `SELECT p.promotion_id,d.draft_id,d.show_day,d.venue_id,
            (r.show_id IS NOT NULL) AS already_resolved
       FROM ppw_promotions p LEFT JOIN ppw_booking_drafts d
         ON d.world_id=p.world_id AND d.promotion_id=p.promotion_id
           AND d.year=$2 AND d.week=$3 AND d.status='SUBMITTED'
       LEFT JOIN ppw_show_resolutions r ON r.world_id=d.world_id
         AND r.show_id=d.draft_id AND r.resolved_week_index=(($2::integer-1)*52+$3::integer-1)
      WHERE p.world_id=$1 AND p.lifecycle='ACTIVE'
      ORDER BY p.promotion_id LIMIT 129`,
    [worldId,year,week],
  );
  if(promotions.length>128) throw new Error("World has too many active promotions for weekly inspection");
  const slots=await tx.query<{draft_id:string;slot_id:string;position:number;kind:string;payload:unknown}>(
    `SELECT s.draft_id,s.slot_id,s.position,s.kind,s.payload FROM ppw_card_slots s
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
  const requested:Array<{promotionId:string;showId:string;day:number;personId:string;contractId:string;alreadyResolved:boolean}>=[];
  const venuesNeeded=new Set<string>();
  const arbitrationClaims:ResourceClaim[]=[];
  let venueEvidence:Array<{venue_id:string;status:string}>=[];
  let contractEvidence:Array<{
    promotion_id:string;person_id:string;contract_id:string;
    person_status:string|null;weekly_service_capacity:number|null;
    contract_status:string|null;family:string|null;
    remaining_dates:number|null;expires_week_index:number|null;
    exclusive_elsewhere:boolean;
  }>=[];
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
      venuesNeeded.add(p.venue_id);
      arbitrationClaims.push({kind:"VENUE",resourceId:p.venue_id,day:p.show_day,
        promotionId:p.promotion_id,showId});
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
      if(appearances.length>100) throw new Error("Too many show appearances");
    }catch{
      blockers.push({code:"INVALID_CARD",promotionIds:[p.promotion_id],showIds:[showId]});
      continue;
    }
    if(p.show_day===null || p.show_day<1 || p.show_day>7)continue;
    for(const a of appearances) {
      requested.push({promotionId:p.promotion_id,showId,day:p.show_day,personId:a.personId,
        contractId:a.contractId,alreadyResolved:p.already_resolved});
      const key=p.show_day+"\u0000"+a.personId;
      const prev=wrestlers.get(key);
      if(prev && prev.promotionId!==p.promotion_id)blockers.push({
        code:"WRESTLER_DAY_CONFLICT",promotionIds:[prev.promotionId,p.promotion_id],
        showIds:[prev.showId,showId],resourceId:a.personId,day:p.show_day,
      });
      else if(!prev)wrestlers.set(key,{promotionId:p.promotion_id,showId,day:p.show_day,personId:a.personId});
    }
  }
  // Registry validation is a single indexed batch lookup, never per venue.
  if(venuesNeeded.size){
    const venueRows=await tx.query<{venue_id:string;status:string}>(
      "SELECT venue_id,status FROM ppw_venues WHERE world_id=$1 AND venue_id=ANY($2::text[])",
      [worldId,[...venuesNeeded]],
    );
    venueEvidence=[...venueRows].sort((a,b)=>a.venue_id.localeCompare(b.venue_id,"en"));
    const byVenue=new Map(venueRows.map(v=>[v.venue_id,v.status]));
    for(const p of promotions) {
      if(p.draft_id && p.show_day!==null && typeof p.venue_id==="string" && p.venue_id.trim()
        && byVenue.get(p.venue_id)!=="ACTIVE")
        blockers.push({code:"VENUE_UNAVAILABLE",promotionIds:[p.promotion_id],
          showIds:[p.draft_id],resourceId:p.venue_id,day:p.show_day});
    }
  }
  if(requested.length>12800) throw new Error("World has too many wrestler appearances");
  if(requested.length){
    const weekIndex=(year-1)*52+week-1;
    // The unnest join checks BOTH promotion-specific contracts and global
    // exclusive rights in one round-trip. Every requested slot is validated.
    const rows=await tx.query<{
      promotion_id:string;person_id:string;contract_id:string;
      person_status:string|null;weekly_service_capacity:number|null;
      contract_status:string|null;family:string|null;
      remaining_dates:number|null;expires_week_index:number|null;
      exclusive_elsewhere:boolean;
    }>(
      `SELECT req.promotion_id,req.person_id,req.contract_id,
           p.status AS person_status,p.weekly_service_capacity,
           c.status AS contract_status,c.family,c.remaining_dates,c.expires_week_index,
           EXISTS(SELECT 1 FROM ppw_contracts x
             WHERE x.world_id=$1 AND x.person_id=req.person_id
               AND x.promotion_id<>req.promotion_id AND x.status='SIGNED'
               AND x.family='EXCLUSIVE' AND x.expires_week_index >= $5) AS exclusive_elsewhere
         FROM unnest($2::text[],$3::text[],$4::text[]) AS req(promotion_id,person_id,contract_id)
         LEFT JOIN ppw_people p ON p.world_id=$1 AND p.person_id=req.person_id
         LEFT JOIN ppw_contracts c ON c.world_id=$1 AND c.contract_id=req.contract_id
           AND c.person_id=req.person_id AND c.promotion_id=req.promotion_id`,
      [worldId,requested.map(a=>a.promotionId),requested.map(a=>a.personId),
        requested.map(a=>a.contractId),weekIndex],
    );
    if(rows.length!==requested.length) throw new Error("Wrestler availability batch mismatch");
    contractEvidence=[...rows].sort((a,b)=>
      [a.promotion_id,a.person_id,a.contract_id].join("\u0000")
      .localeCompare([b.promotion_id,b.person_id,b.contract_id].join("\u0000"),"en"));
    const capacity=new Map<string,number>();
    // Associating by IDs avoids relying on unspecified SQL result order.
    const byContract=new Map(rows.map(r=>[r.promotion_id+"\u0000"+r.person_id+"\u0000"+r.contract_id,r]));
    const scheduled=new Map<string,typeof requested>();
    for(const a of requested){
      const r=byContract.get(a.promotionId+"\u0000"+a.personId+"\u0000"+a.contractId);
      if(!r) throw new Error("Missing wrestler eligibility row");
      if(r.person_status!=="ACTIVE")
        blockers.push({code:"WRESTLER_UNAVAILABLE",promotionIds:[a.promotionId],
          showIds:[a.showId],resourceId:a.personId,day:a.day});
      // The durable show resolution receipt proves a charged appearance.
      // A remaining balance of zero is then valid ONLY for that resolved show.
      // It must still block an unresolved show seeking a fresh appearance.
      const datesValid=r.remaining_dates!==null &&
        (r.remaining_dates>0 || (a.alreadyResolved && r.remaining_dates===0));
      const valid=r.contract_status==="SIGNED" && !r.exclusive_elsewhere
        && r.expires_week_index!==null && r.expires_week_index>=weekIndex
        && (r.family==="EXCLUSIVE"
          ? (r.remaining_dates===null || datesValid)
          : ((r.family==="ONE_OFF"||r.family==="LIMITED_NON_EXCLUSIVE") && datesValid));
      if(!valid) blockers.push({code:"CONTRACT_UNAVAILABLE",promotionIds:[a.promotionId],
        showIds:[a.showId],resourceId:a.personId,day:a.day});
      const cap=r.weekly_service_capacity??7;
      if(!Number.isSafeInteger(cap)||cap<1||cap>7) throw new Error("Invalid weekly service capacity");
      capacity.set(a.personId,cap);
      arbitrationClaims.push({kind:"WRESTLER",resourceId:a.personId,day:a.day,
        promotionId:a.promotionId,showId:a.showId,weeklyCapacity:cap});
      const arr=scheduled.get(a.personId)??[];
      arr.push(a);scheduled.set(a.personId,arr);
    }
    for(const [personId,bookings] of scheduled){
      if(bookings.length>(capacity.get(personId)??7)) blockers.push({
        code:"WRESTLER_WEEK_CAPACITY",
        promotionIds:[...new Set(bookings.map(b=>b.promotionId))],
        showIds:[...new Set(bookings.map(b=>b.showId))],resourceId:personId,
      });
    }
  }
  // No extra SQL: hash ONLY the evidence already fetched for inspection.
  // This invalidates a recorded proposal if a card script, schedule, venue
  // state, contract eligibility or capacity changes without a revision bump.
  const stateFingerprint=createHash("sha256").update(JSON.stringify({
    worldId,worldSeed,year,week,promotions,slots,venues:venueEvidence,
    contracts:contractEvidence,
  })).digest("hex");
  return {year,week,activePromotions:promotions.length,submittedShows,
    inspectedSlots:slots.length,blockers,worldSeed,arbitrationClaims,stateFingerprint,
    provisionalClear:promotions.length>0 && blockers.length===0};
}
