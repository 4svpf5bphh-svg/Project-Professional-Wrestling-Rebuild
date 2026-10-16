import {createHash} from "node:crypto";
import type {CommercialSnapshot} from "../db/prepared-show-demand.js";
import {readCardParticipants} from "./card-participants.js";
import {uniqueShowAppearances} from "./appearance-policy.js";

export interface ReadyDraftEvidence {
  worldId:string;promotionId:string;showId:string;
  year:number;week:number;day:number|null;venueId:string|null;
  slots:readonly {slot_id:string;position:number;kind:string;payload:unknown}[];
  commercial?:CommercialSnapshot;
}
export function validatePreparedDraft(d:ReadyDraftEvidence):string|null {
  if(!d.worldId||!d.promotionId||!d.showId||
    !Number.isSafeInteger(d.day)||d.day!<1||d.day!>7||
    typeof d.venueId!=="string"||!d.venueId.trim())return "MISSING_SCHEDULE";
  if(d.slots.length<1||d.slots.length>100)return "CARD_SIZE";
  const positions=new Set<number>();
  const appearances:ReturnType<typeof readCardParticipants>=[];
  try{
    for(const slot of d.slots){
      if(!slot.slot_id||!Number.isSafeInteger(slot.position)||slot.position<0 ||
        positions.has(slot.position))return "INVALID_SLOT";
      positions.add(slot.position);
      if(slot.kind!=="MATCH"&&slot.kind!=="SEGMENT")return "INVALID_SLOT";
      const participants=readCardParticipants(slot.payload);
      if(slot.kind==="MATCH"&&participants.length<2)return "INCOMPLETE_MATCH";
      appearances.push(...participants);
    }
    uniqueShowAppearances(appearances);
    if(appearances.length>3000)return "TOO_MANY_APPEARANCES";
  }catch{return "INVALID_PARTICIPANTS";}
  return null;
}
export function preparedDraftFingerprint(d:ReadyDraftEvidence):string {
  return createHash("sha256").update(JSON.stringify({
    worldId:d.worldId,promotionId:d.promotionId,showId:d.showId,
    year:d.year,week:d.week,day:d.day,venueId:d.venueId,
    commercial:d.commercial,
    slots:[...d.slots].sort((a,b)=>a.position-b.position || a.slot_id.localeCompare(b.slot_id,"en")),
  })).digest("hex");
}
