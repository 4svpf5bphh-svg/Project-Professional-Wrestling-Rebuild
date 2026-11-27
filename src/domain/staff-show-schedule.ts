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
  preferredDays?:readonly number[];
  preferredVenueIds?:readonly string[];
}
export interface StaffScheduleChoice {day:number;venueId:string}

/** Server-seeded, submission-order-independent options. This cannot override
 * any scheduling field the player already set. Never replaces a wrestler or
 * changes a match result. Alternatives are rechecked inside the World write.
 */
export function chooseStaffFallbackSchedule(input:StaffScheduleInput):StaffScheduleChoice|null {
  return staffFallbackSchedules(input).next().value??null;
}

export function* staffFallbackSchedules(input:StaffScheduleInput):Generator<StaffScheduleChoice,void> {
  const {worldId,worldSeed,year,week,promotionId,showId}=input;
  if(!worldId||!worldSeed||!promotionId||!showId ||
    !Number.isSafeInteger(year)||year<1||!Number.isSafeInteger(week)||week<1||week>52||
    input.personIds.length>100||input.bookedShows.length>256||
    input.availableVenueIds.length>256||(input.excludedDays?.length??0)>7||
    input.excludedDays?.some(day=>!Number.isInteger(day)||day<1||day>7)||
    (input.preferredDays?.length??0)>7||
    input.preferredDays?.some(day=>!Number.isInteger(day)||day<1||day>7))
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
  const priority=(c:StaffScheduleChoice)=>createHash("sha256").update(JSON.stringify([
    "ppw-staff-schedule-v1",worldId,worldSeed,year,week,promotionId,c.day,c.venueId,
  ])).digest("hex");
  // Premium attractions prefer weekends when there is a safe, free slot.
  // Never veto an available weekday if weekend venues are all occupied.
  const preferred=new Set(input.preferredDays??[]);
  const preferredVenueIds=new Set(input.preferredVenueIds??[]);
  const candidates=days.flatMap(day=>availableVenues.map(venueId=>{
    const choice={day,venueId};
    return {choice,priority:priority(choice),tier:preferred.has(day)?0:1};
  }));
  candidates.sort((a,b)=>{
    return a.tier-b.tier||Number(preferredVenueIds.has(b.choice.venueId))-
      Number(preferredVenueIds.has(a.choice.venueId))||(a.priority<b.priority?-1:a.priority>b.priority?1:
      a.choice.day-b.choice.day||a.choice.venueId.localeCompare(b.choice.venueId,"en"));
  });
  for(const {choice:candidate} of candidates){
    const conflicts=input.bookedShows.some(other=>other.showId!==showId &&
      other.day===candidate.day &&
      (other.venueId===candidate.venueId || other.personIds.some(id=>personIds.has(id))));
    if(!conflicts)yield candidate;
  }
}
