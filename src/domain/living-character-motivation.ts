/** Evidence-led career direction for a wrestler inside ONE human promotion.
 * Unlike a random personality roll, every high-priority direction comes from
 * an immutable show memory or an actual Backstage conversation. This is an
 * advisory projection, not a booking instruction, morale bonus or new state.
 */
export type MotivationSource="BACKSTAGE"|"PROMISE"|"CERTIFIED"|"CAREER";
export type MotivationNext="BACKSTAGE"|"BOOKING"|"PROGRAMMES"|"NONE";
export interface LivingMotivation{
 kind:string;title:string;reason:string;source:MotivationSource;
 next:MotivationNext;
}
export interface LivingMotivationInput{
 onRoster:boolean;status?:string|null;careerStage?:string|null;
 momentum?:number|null;morale?:number|null;fatigue?:number|null;
 currentWeekIndex:number;championships?:readonly string[]|null;
 memories?:readonly {kind:string;weekIndex:number}[]|null;
 requests?:readonly {kind:string;status:string;createdWeekIndex:number;
  decision?:string|null;dueWeekIndex?:number|null;
  relevantTitle?:string|null;relatedName?:string|null;
  verifiedShows?:number|null;respondedWeekIndex?:number|null;
  followThroughWeekIndex?:number|null}[]|null;
}
const validWeek=(x:number)=>Number.isSafeInteger(x)&&x>=0;
const validNumber=(x:number|null|undefined)=>typeof x==="number"&&Number.isFinite(x);
const make=(kind:string,title:string,reason:string,source:MotivationSource,
 next:MotivationNext):LivingMotivation=>({kind,title,reason,source,next});
const weekLabel=(index:number)=>"Y"+(Math.floor(index/52)+1)+" W"+(index%52+1);
function requestFocus(kind:string,title:string|null|undefined,
 relatedName?:string|null,verifiedShows?:number|null){
 switch(kind){
  case "CREATIVE":return ["Find their voice","They have requested microphone or angle time.","BOOKING"] as const;
  case "TITLE_AMBITION":return ["Chase championship gold",
   "They want another opportunity"+(title?" at "+title:" at a championship")+".","PROGRAMMES"] as const;
  case "RIVALRY_PITCH":return [
   relatedName?"Build a rivalry with "+relatedName:"Turn the spark into a rivalry",
   typeof verifiedShows==="number"&&verifiedShows>=2&&relatedName?
    "After "+verifiedShows+" completed singles matches with "+relatedName+
    ", they have suggested a programme.":
    "Their verified matches led them to suggest a programme.",
   "PROGRAMMES"] as const;
  case "MENTORSHIP_PITCH":return [
   relatedName?"Help "+relatedName+" develop":"Help a prospect grow",
   typeof verifiedShows==="number"&&verifiedShows>=2&&relatedName?
    "After "+verifiedShows+" completed tag matches together, they want"+
    " to help "+relatedName+" grow through more shared matches.":
    "An experienced wrestler proposed guiding a prospect after real team work.",
   "BOOKING"] as const;
  case "TAG_TEAM_PITCH":return [
   relatedName?"Team with "+relatedName:"Make the partnership official",
   typeof verifiedShows==="number"&&verifiedShows>=2&&relatedName?
    "After "+verifiedShows+" completed tag matches together, they want to"+
    " explore a team with "+relatedName+".":
    "Strong completed tag performances led to a team proposal.",
   "BACKSTAGE"] as const;
  case "PARTNERSHIP":return [
   relatedName?"Repair the working bond with "+relatedName:"Repair a partnership",
   relatedName?"Verified team work with "+relatedName+
    " has put professional trust under strain.":
    "Their working relationship has been strained by actual matches.",
   "BACKSTAGE"] as const;
  case "LOSS_STREAK":return ["Reverse the losing run",
   "Recent certified losses have raised questions about their direction.","BOOKING"] as const;
  case "BOOKING_OMISSION":return ["Get back on the card",
   "They have raised their absence from completed shows.","BOOKING"] as const;
  case "ROLE_USAGE":return ["Earn their contracted position",
   "They have asked about their agreed featured role.","BOOKING"] as const;
  case "GIMMICK_PITCH":return ["Reconsider their character",
   "Poor audience response prompted a character discussion. Their consent remains required.","BACKSTAGE"] as const;
  case "TRUST_CHECK_IN":return ["Rebuild confidence in the booker",
   "An earlier broken commitment is still being discussed.","BACKSTAGE"] as const;
  case "MOMENTUM":return ["Recover momentum",
   "They have raised concerns about their recent momentum.","BOOKING"] as const;
  case "MEDICAL_SUPPORT":return ["Plan a safe return",
   "They have requested support while medically unavailable.","BACKSTAGE"] as const;
  case "CONTRACT":return ["Decide their future",
   "They have approached you about their contractual future.","BACKSTAGE"] as const;
  case "MORALE":return ["Feel part of the promotion",
   "They have raised a concern about their place in the locker room.","BACKSTAGE"] as const;
  default:return null;
 }
}
/** No DB access, clock reads, randomness or AI generation. A request is never
 * itself proof that a match, title change or storyline has been booked.
 */
export function livingWrestlerMotivation(i:LivingMotivationInput):LivingMotivation|null{
 if(!i.onRoster||i.status==="RETIRED"||!validWeek(i.currentWeekIndex))return null;
 // Medical availability always takes precedence over a booking desire.
 if(i.status==="INJURED")
  return make("RECOVERY","Return when cleared",
   "They are medically unavailable. A safe return comes before new matches.",
   "CAREER","NONE");
 const requests=(i.requests??[]).filter(r=>validWeek(r.createdWeekIndex)&&
  r.createdWeekIndex<=i.currentWeekIndex&&
  i.currentWeekIndex-r.createdWeekIndex<=26&&
  (r.status==="PENDING"||r.status==="PROMISED"))
  .sort((a,b)=>b.createdWeekIndex-a.createdWeekIndex||a.kind.localeCompare(b.kind));
 const live=requests.find(r=>requestFocus(r.kind,r.relevantTitle)!=null);
 if(live){
  const focus=requestFocus(live.kind,live.relevantTitle,
   live.relatedName,live.verifiedShows)!;
  if(live.status==="PROMISED"){
   const due=validWeek(live.dueWeekIndex??-1)?
    " by "+weekLabel(live.dueWeekIndex!):"";
   const deliverable=live.kind==="CREATIVE"?"promo or angle":
    live.kind==="ROLE_USAGE"?"featured match":"appearance";
   return make("PROMISE_PENDING","Deliver the "+deliverable,
    "You accepted a booking commitment"+due+
    ". Only a certified completed show can fulfil it.",
    "PROMISE","BOOKING");
  }
  return make(live.kind,focus[0],focus[1]+" You have not replied yet.",
   "BACKSTAGE","BACKSTAGE");
 }
 // Accepted wrestler ideas stay visible for up to eight weeks until a real
 // programme or completed tag match records follow-through.
 const accepted=(i.requests??[]).filter(r=>
  r.status==="ANSWERED"&&r.followThroughWeekIndex==null&&
  ((r.kind==="RIVALRY_PITCH"&&r.decision==="EXPLORE_RIVALRY")||
   (r.kind==="TAG_TEAM_PITCH"&&r.decision==="EXPLORE_TEAM")||
   (r.kind==="MENTORSHIP_PITCH"&&r.decision==="EXPLORE_MENTORSHIP"))&&
  !!r.relatedName?.trim()&&validWeek(r.createdWeekIndex)&&
  validWeek(r.respondedWeekIndex??-1)&&
  r.respondedWeekIndex!<=i.currentWeekIndex&&
  i.currentWeekIndex-r.respondedWeekIndex!<=8)
  .sort((a,b)=>b.respondedWeekIndex!-a.respondedWeekIndex!||
   b.createdWeekIndex-a.createdWeekIndex);
 const direction=accepted[0];
 if(direction?.kind==="RIVALRY_PITCH")
  return make("RIVALRY_FOLLOW_THROUGH",
   "Plan the rivalry with "+direction.relatedName,
   "You agreed to explore their verified rivalry pitch. "+
   "A real programme with "+direction.relatedName+" has not been recorded yet.",
   "BACKSTAGE","PROGRAMMES");
 if(direction?.kind==="MENTORSHIP_PITCH")
  return make("MENTORSHIP_FOLLOW_THROUGH",
   "Guide "+direction.relatedName+" in the ring",
   "You accepted a veteran's mentoring idea. Only a new completed match"+
   " teaming them with "+direction.relatedName+" will record that next step.",
   "BACKSTAGE","BOOKING");
 if(direction?.kind==="TAG_TEAM_PITCH")
  return make("TAG_FOLLOW_THROUGH",
   "Build the team with "+direction.relatedName,
   "You agreed to explore the partnership. "+
   "A completed tag match alongside "+direction.relatedName+
   " will record the follow-through.",
   "BACKSTAGE","BOOKING");
 const memories=(i.memories??[]).filter(m=>validWeek(m.weekIndex)&&
  m.weekIndex<=i.currentWeekIndex&&i.currentWeekIndex-m.weekIndex<=26)
  .sort((a,b)=>b.weekIndex-a.weekIndex||a.kind.localeCompare(b.kind));
 const broken=memories.find(m=>m.kind==="PROMISE_BROKEN");
 const repaired=memories.some(m=>m.kind==="PROMISE_KEPT"&&
  broken&&m.weekIndex>broken.weekIndex);
 if(broken&&!repaired)return make("PROMISE_BROKEN","Rebuild the trust",
  "An earlier booking promise went unfulfilled. Future actions can restore confidence.",
  "CERTIFIED","BACKSTAGE");
 // A genuine declined request remains a brief private memory, without
 // inventing a morale penalty, feud, contract or future booking duty.
 const refused=memories.find(m=>m.kind==="REQUEST_DECLINED"&&
  i.currentWeekIndex-m.weekIndex<=4);
 if(refused)return make("REQUEST_DECLINED","A request was turned down",
  "You declined a wrestler's request in "+weekLabel(refused.weekIndex)+
   ". That decision is recorded; it did not promise or schedule anything.",
  "CERTIFIED","BACKSTAGE");
 const titles=i.championships?.length??0;
 const chance=memories.find(m=>m.kind==="TITLE_CHALLENGE");
 const newerWin=memories.some(m=>m.kind==="TITLE_WON"&&
  chance&&m.weekIndex>=chance.weekIndex);
 if(chance&&!newerWin&&titles===0)
  return make("TITLE_CHALLENGE","Earn another title opportunity",
   "A verified championship challenge ended without a recorded title win.",
   "CERTIFIED","PROGRAMMES");
 if(titles>0)return make("CHAMPION","Protect the gold",
  "They currently hold championship gold. Booking choices determine how the reign develops.",
  "CAREER","BOOKING");
 if(validNumber(i.momentum)&&i.momentum!<30)
  return make("LOW_MOMENTUM","Find a way forward",
   "Current momentum is low. A meaningful programme or match could give them direction.",
   "CAREER","PROGRAMMES");
 if(validNumber(i.morale)&&i.morale!<35)
  return make("LOW_MORALE","Find their place",
   "Current morale is low. Their next booking and treatment may matter.",
   "CAREER","BACKSTAGE");
 switch(i.careerStage){
  case "PROSPECT":return make("PROSPECT","Make their name",
   "At this career stage, consistent opportunities can build experience.",
   "CAREER","BOOKING");
  case "VETERAN":return make("VETERAN","Make experience count",
   "Their established experience gives you options for meaningful programmes.",
   "CAREER","PROGRAMMES");
  case "SPECIAL_ATTRACTION":return make("SPECIAL_ATTRACTION","Make appearances matter",
   "A special attraction benefits from carefully chosen opportunities.",
   "CAREER","BOOKING");
  case "PRIME":return make("PRIME","Build their defining run",
   "They are in their prime; their booking can shape the next chapter.",
   "CAREER","PROGRAMMES");
  default:return null;
 }
}
