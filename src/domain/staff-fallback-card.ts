import {createHash} from "node:crypto";
import {chooseStaffFallbackSchedule,type ExistingShowBooking,type StaffScheduleChoice}
  from "./staff-show-schedule.js";

export type StaffBookingDivision="MEN"|"WOMEN";
export interface StaffWrestlerCandidate {
  personId:string;contractId:string;bookingDivision:StaffBookingDivision;weeklyCapacity:number;
}
export interface StaffFallbackCardInput {
  worldId:string;worldSeed:string;year:number;week:number;
  promotionId:string;showId:string;
  roster:readonly StaffWrestlerCandidate[];
  bookedShows:readonly ExistingShowBooking[];
  activeVenues:readonly string[];
}
export type StaffCardChoice=
  | {status:"READY";performers:[StaffWrestlerCandidate,StaffWrestlerCandidate];
     scriptedWinner:string;schedule:StaffScheduleChoice}
  | {status:"UNFILLED";reason:"NO_ELIGIBLE_PAIR"|"NO_VENUE_OR_DAY"};
const digest=(parts:readonly (string|number)[])=>createHash("sha256")
  .update(JSON.stringify(parts)).digest("hex");

/** Deliberately tiny fallback: one same-division singles match. Deterministic
 * staff authors its finish under explicit player permission. The simulation
 * must NEVER rewrite this authored winner. Emergency quality and storyline
 * limitations must be applied by later consequence rules.
 */
export function chooseEmergencyStaffCard(input:StaffFallbackCardInput):StaffCardChoice {
  if(!input.worldId||!input.worldSeed||!input.promotionId||!input.showId||
    input.roster.length>256||input.bookedShows.length>128)
    throw new Error("Invalid emergency staff card scope");
  const used=new Map<string,number>();
  for(const show of input.bookedShows){
    for(const person of new Set(show.personIds))
      used.set(person,(used.get(person)??0)+1);
  }
  const unique=new Map<string,StaffWrestlerCandidate>();
  for(const c of input.roster){
    if(!c.personId||!c.contractId||
      !["MEN","WOMEN"].includes(c.bookingDivision)||
      !Number.isSafeInteger(c.weeklyCapacity)||c.weeklyCapacity<1||c.weeklyCapacity>7)
      throw new Error("Invalid staff roster candidate");
    const existing=unique.get(c.personId);
    if(existing && existing.bookingDivision!==c.bookingDivision)
      throw new Error("Inconsistent roster division");
    if((used.get(c.personId)??0)<c.weeklyCapacity &&
       (!existing||c.contractId<existing.contractId))
      unique.set(c.personId,c);
  }
  const score=(personId:string)=>digest([
    "ppw-staff-match-v1",input.worldId,input.worldSeed,input.year,input.week,
    input.promotionId,personId,
  ]);
  const ranked=[...unique.values()].sort((a,b)=>{
    const x=score(a.personId),y=score(b.personId);
    return x<y?-1:x>y?1:a.personId.localeCompare(b.personId,"en");
  });
  // Start with the strongest deterministic combination, not nearest arrival.
  for(let i=0;i<ranked.length;i++){
    const a=ranked[i]!;
    for(let j=i+1;j<ranked.length;j++){
      const b=ranked[j]!;
      if(a.bookingDivision!==b.bookingDivision)continue;
      const schedule=chooseStaffFallbackSchedule({
        worldId:input.worldId,worldSeed:input.worldSeed,year:input.year,week:input.week,
        promotionId:input.promotionId,showId:input.showId,
        preferredDay:null,preferredVenueId:null,
        personIds:[a.personId,b.personId],
        availableVenueIds:input.activeVenues,bookedShows:input.bookedShows,
      });
      if(!schedule)continue;
      const result=[a,b] as [StaffWrestlerCandidate,StaffWrestlerCandidate];
      const winScore=digest(["ppw-staff-finish-v1",input.worldId,input.worldSeed,
        input.year,input.week,input.promotionId,a.personId,b.personId]);
      return {status:"READY",performers:result,scriptedWinner:
        parseInt(winScore.slice(0,2),16)%2===0?a.personId:b.personId,schedule};
    }
  }
  const eligibleGroups=new Map<string,number>();
  for(const c of ranked)eligibleGroups.set(c.bookingDivision,(eligibleGroups.get(c.bookingDivision)??0)+1);
  return {status:"UNFILLED",reason:[...eligibleGroups.values()].some(n=>n>=2)?
    "NO_VENUE_OR_DAY":"NO_ELIGIBLE_PAIR"};
}
export function orderStaffPromotions(worldId:string,seed:string,year:number,week:number,
  promotionIds:readonly string[]):string[] {
  return [...new Set(promotionIds)].sort((a,b)=>{
    const x=digest(["ppw-staff-queue-v1",worldId,seed,year,week,a]);
    const y=digest(["ppw-staff-queue-v1",worldId,seed,year,week,b]);
    return x<y?-1:x>y?1:a.localeCompare(b,"en");
  });
}
