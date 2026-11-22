import type {StaffRole} from "../domain/world-staff.js";
/** Tone only. Never changes the named department's verified observations. */
export type MeetingPersonality="FRANK"|"PATIENT"|"ECCENTRIC"|"LOYAL"|"AMBITIOUS"|null;
export function staffMeetingDialogue(input:{
 role:StaffRole;staffName:string|null;personality:MeetingPersonality;message:string;
}):string{
 const {staffName,personality,message}=input;
 if(!staffName)return "House office note: "+message;
 const calm=/^(?:No |Nothing |We have no |There are no |Our referees )/i.test(message);
 const openings:Record<Exclude<MeetingPersonality,null>,readonly [string,string]>={
  FRANK:["Straight answer? ","Good, no drama there. "],
  PATIENT:["Here's how I'd approach it. ","For now, let's keep it steady. "],
  ECCENTRIC:["Here's the part that caught my eye. ","No fire to put out here. "],
  LOYAL:["Let's look after the people involved. ","The team's in a good place here. "],
  AMBITIOUS:["Here's where I would push further. ","Good, now let's build on it. "]
 };
 const ambitiousCues:Partial<Record<StaffRole,string>>={
  CREATIVE:"The creative opportunity: ",COMMENTATOR:"For the broadcast: ",
  SCOUT:"From the scouting desk: ",TALENT_MANAGER:"On the contracts: ",
  ROAD_AGENT:"From Gorilla: ",PRODUCTION:"For the next show: ",
  MEDICAL:"On wrestler fitness: ",REFEREE:"From the referee: ",
  TRAINER:"On the training side: "
 };
 const intro=personality==="AMBITIOUS"?
  ambitiousCues[input.role]??"Here's the opportunity: ":
  personality?openings[personality][calm?1:0]:"";
 return intro+message;
}

/** A recommendation is a distinct choice spoken by the employed specialist,
 * not a fabricated decision or a second generic "we should" notification.
 */
export function staffRecommendationVoice(input:{
 role:StaffRole;personality:MeetingPersonality;nextStep:string;
 urgency?:"ACTION"|"WATCH"|"CLEAR";specialism?:string|null
}):string{
 const {role,personality,nextStep}=input;
 if(!personality)return nextStep;
 const urgent=input.urgency==="ACTION";
 const framing:Record<Exclude<MeetingPersonality,null>,string>={
  FRANK:urgent?"I'd deal with this before we book another card. ":
   "Here's what I'd actually do. ",
  PATIENT:urgent?"One change at a time, but I wouldn't leave it unattended. ":
   "We can be deliberate here. ",
  AMBITIOUS:urgent?"There is upside to fixing this properly, not rushing it. ":
   "I want us thinking ahead. ",
  LOYAL:urgent?"The people involved deserve a clear call from us. ":
   "I'd protect the long-term relationships. ",
  ECCENTRIC:urgent?"This is where a clever booking decision beats another speech. ":
   "Let's find the interesting detail rather than making noise. "
 };
 // The real specialist's remit matters more than inserting a random quip.
 const focus:Partial<Record<StaffRole,string>>={
  MEDICAL:personality==="FRANK"?"We do not gamble on a clearance. ":"",
  CREATIVE:personality==="ECCENTRIC"?"A different scene, not the same speech in new clothes. ":"",
  ROAD_AGENT:personality==="PATIENT"?"We can build the pace without changing your finish. ":"",
  REFEREE:personality==="FRANK"?"I need an exact instruction, not a guess. ":"",
  TALENT_MANAGER:personality==="AMBITIOUS"?"An impossible offer is not ambition. ":"",
  SCOUT:personality==="LOYAL"?"We owe prospects realistic expectations. ":""
 };
 // Specific, bounded alternatives from a real hired professional.
 // Temperament affects a decision, not just the greeting.
 const options:Partial<Record<StaffRole,
  Partial<Record<Exclude<MeetingPersonality,null>,string>>>>={
  CREATIVE:{
   FRANK:"Name what changes in the next scene; cut the recycled confrontation. ",
   PATIENT:"Let the next chapter reveal one fresh motive before rushing a payoff. ",
   AMBITIOUS:"Shape the next beat towards an earned major-show payoff, not an unbooked result. ",
   LOYAL:"Give the wrestler a credible reason for change before demanding a turn. ",
   ECCENTRIC:"Change the setting or point of view while keeping the story understandable. "
  },
  TALENT_MANAGER:{
   FRANK:"Check calendar conflicts before discussing the money. ",
   PATIENT:"Start with the dates the wrestler can truly fulfil, then talk terms. ",
   AMBITIOUS:"A bigger role is worthwhile only if outside commitments permit it. ",
   LOYAL:"Protect the working relationship by being clear about available appearances. ",
   ECCENTRIC:"A glamorous contract is useless if the calendar cannot accommodate it. "
  },
  MEDICAL:{
   FRANK:"A medical restriction is not negotiable. ",
   PATIENT:"Build the next card around the recorded recovery timetable. ",
   AMBITIOUS:"Long-term wrestler availability matters more than one show. ",
   LOYAL:"Prioritise the injured performer's recovery over a rushed return. ",
   ECCENTRIC:"An elaborate entrance does not count as medical clearance. "
  },
  ROAD_AGENT:{
   FRANK:"Strip out spots that do not serve the finish. ",
   PATIENT:"Make the key turning point work at the time actually allotted. ",
   AMBITIOUS:"Make the match feel bigger through earned stakes, not invented near-falls. ",
   LOYAL:"Protect both wrestlers with a finish they can credibly execute. ",
   ECCENTRIC:"Find one memorable legal exchange instead of six disconnected stunts. "
  }
 };
 const specific=input.urgency==="CLEAR"?"":options[role]?.[personality]??"";
 return framing[personality]+(focus[role]??"")+specific+nextStep;
}
