import {createHash} from "node:crypto";

export interface ExistingShowBooking {
  showId:string;day:number;venueId:string;personIds:readonly string[];
}
export interface StaffScheduleInput {
  worldId:string;worldSeed:string;year:number;week:number;
  promotionId:string;showId:string;
  preferredDay:number|null;preferredVenueId:string|null;
  personIds:readonly string[];
  availableVenueIds:readonly string[];
  bookedShows:readonly ExistingShowBooking[];
  excludedDays?:readonly number[];
}
export interface StaffScheduleChoice {day:number;venueId:string}

/** Server-seeded, submission-order-independent options. This cannot override
 * any scheduling field the player already set. Never replaces a wrestler or
 * changes a match result. Alternatives are rechecked inside the World write.
 */
export function chooseStaffFallbackSchedule(input:StaffScheduleInput):StaffScheduleChoice|null {
  const {worldId,worldSeed,year,week,promotionId,showId}=input;
  if(!worldId||!worldSeed||!promotionId||!showId ||
    !Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52||
    input.personIds.length>100||input.bookedShows.length>128||
    input.availableVenueIds.length>256||(input.excludedDays?.length??0)>7||
    input.excludedDays?.some(day=>!Number.isInteger(day)||day<1||day>7))
    throw new Error("Invalid staff schedule scope");
  if(input.preferredDay!==null &&
      (!Number.isInteger(input.preferredDay)||input.preferredDay<1||input.preferredDay>7))
    throw new Error("Invalid requested day");
  if(input.preferredVenueId!==null&&(!input.preferredVenueId||input.preferredVenueId.length>200))
    throw new Error("Invalid requested venue");
  const venues=[...new Set(input.availableVenueIds)].sort();
  if(venues.length!==input.availableVenueIds.length)throw new Error("Duplicate venue in staff catalogue");
  const personIds=new Set(input.personIds);
  const days=(input.preferredDay===null?[1,2,3,4,5,6,7]:[input.preferredDay])
    .filter(day=>!input.excludedDays?.includes(day));
  const availableVenues=input.preferredVenueId===null?venues:
    venues.includes(input.preferredVenueId)?[input.preferredVenueId]:[];
  const candidates=days.flatMap(day=>availableVenues.map(venueId=>({day,venueId})));
  const priority=(c:StaffScheduleChoice)=>createHash("sha256").update(JSON.stringify([
    "ppw-staff-schedule-v1",worldId,worldSeed,year,week,promotionId,c.day,c.venueId,
  ])).digest("hex");
  candidates.sort((a,b)=>{
    const x=priority(a),y=priority(b);
    return x<y?-1:x>y?1:a.day-b.day||a.venueId.localeCompare(b.venueId,"en");
  });
  for(const candidate of candidates){
    const conflicts=input.bookedShows.some(other=>other.showId!==showId &&
      other.day===candidate.day &&
      (other.venueId===candidate.venueId || other.personIds.some(id=>personIds.has(id))));
    if(!conflicts)return candidate;
  }
  return null;
}
