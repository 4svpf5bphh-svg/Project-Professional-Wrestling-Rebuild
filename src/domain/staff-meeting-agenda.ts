/** Real staff meeting agenda, derived from the existing bounded Staff Office
 * snapshot. No new World reads, implied promises, or automatic bookings.
 * Hiring brings department advice; essential safety facts remain with House.
 */
import type {StaffRole,WorldStaffMember} from "./world-staff.js";

export type StaffMeetingTarget="staff"|"roster"|"contracts"|"programmes"|"gorilla";
export interface StaffMeetingEvidence{
 contractsDue:readonly {personName:string;weeksRemaining:number}[];
 activeProgrammes:number;repeatedProgrammes:number;
 medicalRisks:number;medicalExample:string|null;
 recentShows:number;recentMatches:number;recentDisqualifications:number;
 fatigueConcerns:number;
 scoutProspects:readonly {name:string}[];
 featured?:{creative:string|null;commentary:string|null;roadAgent:string|null}|null;
}
export interface StaffMeetingAgenda{
 message:string;target:StaffMeetingTarget;priority:"ACTION"|"WATCH"|"CLEAR"|"VACANT";
}
export const STAFF_DEPARTMENT_PURPOSES:Record<StaffRole,{
 does:string;limit:string;target:StaffMeetingTarget;
}>={
 TALENT_MANAGER:{does:"Checks contract expiry, negotiates talent terms and can submit approved same-terms renewals.",
  limit:"Cannot promise acceptance, override another promoter's dates or sign talent without authority.",target:"contracts"},
 ROAD_AGENT:{does:"Reviews match pacing, ring psychology and finishes; helps execute your Gorilla instructions.",
  limit:"Cannot change your booked winner, rewrite the finish or conjure an unbooked rivalry.",target:"gorilla"},
 MEDICAL:{does:"Reviews medical absences, accumulated fatigue and booking safety.",
  limit:"Cannot clear an injury by opinion or erase medical restrictions.",target:"roster"},
 CREATIVE:{does:"Reviews on-air story continuity and proposes distinct character or rivalry beats.",
  limit:"Suggestions are not filmed segments, turns or booked matches.",target:"programmes"},
 COMMENTATOR:{does:"Helps present certified match action and established story history on broadcast.",
  limit:"Cannot invent on-air events or turn a planned angle into a certified result.",target:"programmes"},
 REFEREE:{does:"Helps handle complicated stipulations, legal participants and scripted referee incidents.",
  limit:"Cannot silently change the decision, disqualification or authorised interference.",target:"staff"},
 PRODUCTION:{does:"Organises live-show presentation and can reduce some verified production spending.",
  limit:"Cannot change signed TV dates, invent audience ratings or guarantee savings above the capped production benefit.",target:"staff"},
 TRAINER:{does:"Supports conditioning and modest weekly fatigue recovery for contracted talent.",
  limit:"Cannot overwrite innate skills, remove injuries or manufacture medical clearance.",target:"roster"},
 SCOUT:{does:"Identifies bounded, available prospects and assesses their development potential.",
  limit:"A shortlist is not a signed contract, an offer acceptance or a guaranteed future star.",target:"roster"}
};

const count=(n:number,single:string,plural:string)=>n+" "+(n===1?single:plural);
const perspective=(staff:Pick<WorldStaffMember,"personality"|"specialism">,
 choices:Partial<Record<WorldStaffMember["personality"],string>>,
 fallback:string)=>choices[staff.personality]??fallback;
const trimmed=(value:string,max=175)=>value.trim().slice(0,max);

/** A colleague makes one evidence-based call, not nine generic notices.
 * Temperament alters the RECOMMENDED next beat when alternatives are safe,
 * rather than merely changing a prefixed catchphrase.
 */
export function staffMeetingAgenda(role:StaffRole,facts:StaffMeetingEvidence,
 staff:Pick<WorldStaffMember,"personality"|"specialism">|null):StaffMeetingAgenda{
 const purpose=STAFF_DEPARTMENT_PURPOSES[role],target=purpose.target;
 if(!staff){
  const house=role==="MEDICAL"&&facts.medicalRisks>0?
   "House warning: "+count(facts.medicalRisks,"wrestler is","wrestlers are")+
    " medically unavailable. Clearance rules still apply.":
   role==="TALENT_MANAGER"&&facts.contractsDue.length>0?
    "House reminder: "+count(facts.contractsDue.length,"contract needs","contracts need")+
     " attention, beginning with "+trimmed(facts.contractsDue[0]!.personName)+".":null;
  return {target,priority:"VACANT",message:"No hired "+
   role.toLowerCase().replaceAll("_"," ")+" to give specialist advice. "+
   (house?house+" ":"")+"Recruit somebody for "+purpose.does.charAt(0).toLowerCase()+
   purpose.does.slice(1)};
 }
 const proposal=(options:Partial<Record<WorldStaffMember["personality"],string>>,
  fallback:string)=>perspective(staff,options,fallback);
 switch(role){
  case "TALENT_MANAGER":{
   const first=facts.contractsDue[0];
   if(!first)return {target,priority:"CLEAR",
    message:"No wrestler deals expire in the next twelve weeks. "+
     "I'd use the breathing room to check service commitments before anyone makes a new offer."};
   const due=count(facts.contractsDue.length,"signed deal","signed deals");
   const action=proposal({
    FRANK:"Check the actual dates they can work before quoting a new contract.",
    PATIENT:"Start with their upcoming show dates and leave room for a fair negotiation.",
    AMBITIOUS:"See whether a stronger role is affordable, but check outside commitments first.",
    LOYAL:"Speak to the wrestler early, and don't promise dates their other contract already occupies.",
    ECCENTRIC:"Ask what their calendar really allows; a flashy long-term deal is worthless if they can't appear."
   },"Review the dates before making a renewal offer.");
   return {target,priority:"ACTION",message:due+" nearing expiry. "+
    trimmed(first.personName)+" has "+count(Math.max(0,first.weeksRemaining),"week","weeks")+
    " left. "+action};
  }
  case "ROAD_AGENT":{
   const history=facts.featured?.roadAgent;
   const action=proposal({
    FRANK:"If the next bout runs long, cut unnecessary stretches before adding a complicated finish.",
    PATIENT:"Give the wrestlers room for one credible turning point and a finish they can execute cleanly.",
    AMBITIOUS:"Make the featured match feel important through its stakes, not a pile of near-falls.",
    LOYAL:"Protect the performers with a finish suited to the people and time actually booked.",
    ECCENTRIC:"One memorable exchange is worth more than six unrelated spectacular spots."
   },"Prepare a clear structure and the booked finish.");
   return {target,priority:history?"ACTION":facts.recentMatches?"WATCH":"CLEAR",
    message:history?trimmed(history,380)+" "+action:
     facts.recentMatches?
      count(facts.recentMatches,"match","matches")+" on recent cards. "+action+
      " I'd check the actual stipulation and clock at Gorilla before the bell.":
      "There isn't a recent completed match to review. Bring me a card and I'll check its length, legal participants and finish before showtime."};
  }
  case "MEDICAL":{
   if(facts.medicalRisks>0)return {target,priority:"ACTION",
    message:count(facts.medicalRisks,"contracted wrestler remains","contracted wrestlers remain")+
     " unavailable"+(facts.medicalExample?", including "+trimmed(facts.medicalExample):"")+
     ". "+proposal({
      FRANK:"Do not put them in a physical match until a genuine clearance is recorded.",
      PATIENT:"Plan around their recovery rather than assuming the next show will be safe.",
      AMBITIOUS:"Protect their long-term availability instead of rushing one appearance.",
      LOYAL:"We owe them proper recovery; a storyline can wait for medical clearance.",
      ECCENTRIC:"A huge entrance won't fix a medical restriction. Keep the physical booking off the card."
     },"Check actual clearance before promising physical work.")};
   if(facts.fatigueConcerns>0)return {target,priority:"WATCH",
    message:count(facts.fatigueConcerns,"wrestler has","wrestlers have")+
     " high recorded fatigue. "+proposal({
      FRANK:"Shorten their next physical workload; availability isn't the same as readiness.",
      PATIENT:"Give them a lighter stretch and see how the fatigue changes after the next week.",
      AMBITIOUS:"Protect the next month's appearances by reducing demands now.",
      LOYAL:"Keep their long-term health ahead of an extra match.",
      ECCENTRIC:"Save the big stunt for a week when the body is ready for it."
     },"Review recovery before another demanding card.")};
   return {target,priority:"CLEAR",
    message:"No active medical restrictions or high-fatigue warnings in the current snapshot. "+
     "That is not advance clearance for an injury or stipulation you haven't booked."};
  }
  case "CREATIVE":{
   const spotlight=facts.featured?.creative;
   const action=proposal({
    FRANK:"Stop repeating the same exchange: change the character's decision or close the issue.",
    PATIENT:"Give this story a week to breathe; a small, different character beat can do more than another fight.",
    AMBITIOUS:"Build towards a genuinely booked major payoff instead of another weekly rematch.",
    LOYAL:"Let the people involved explain what matters to them before forcing a turn.",
    ECCENTRIC:"Change the setting or point of view, not just the words in last week's confrontation."
   },"Write a different scene with a specific purpose.");
   if(facts.repeatedProgrammes>0)return {target,priority:"ACTION",
    message:count(facts.repeatedProgrammes,"active story has","active stories have")+
     " repeated recent beats. "+(spotlight?trimmed(spotlight,210)+" ":"")+action};
   if(spotlight)return {target,priority:"WATCH",
    message:trimmed(spotlight,280)+" "+action};
   return {target,priority:facts.activeProgrammes?"WATCH":"CLEAR",
    message:facts.activeProgrammes?
     count(facts.activeProgrammes,"story is","stories are")+" active. "+
      "Give each a different reason to appear; a solo character story does not need a phantom rival.":
     "No active story has earned a chapter yet. Start with a wrestler's motive or a genuine conflict; book the scene yourself."};
  }
  case "COMMENTATOR":{
   const spotlight=facts.featured?.commentary;
   return {target,priority:spotlight?"ACTION":facts.activeProgrammes?"WATCH":"CLEAR",
    message:spotlight?trimmed(spotlight,285)+
     " I can refer back to what actually aired, but I won't promise the next encounter until it's booked.":
     facts.activeProgrammes?
      count(facts.activeProgrammes,"ongoing story","ongoing stories")+
       ". For the next broadcast, give commentary the last on-air result and the next scene's real stakes. No invented revenge.":
      "No established story to call back to. Give me a result or a booked character beat and I'll make its stakes understandable."};
  }
  case "REFEREE":
   return {target,priority:facts.recentDisqualifications>0?"WATCH":"CLEAR",
    message:facts.recentDisqualifications?
     count(facts.recentDisqualifications,"disqualification","disqualifications")+
      " on recent cards. Next time tell me whether the referee sees the interference and what actually causes the decision. "+
      "A distraction isn't automatically a DQ.":
     "No recent DQs. If you want a disputed finish, specify what the referee sees; "+
      "a complicated stipulation still has its own legal winning conditions."};
  case "PRODUCTION":{
   const focus=staff.specialism==="lighting"?
    "I'll plan lighting around the confirmed venue, not create a new atmosphere that wasn't booked.":
    staff.specialism==="efficient travel"?
     "I'll check travel and venue commitments before proposing production savings.":
     staff.specialism==="small venues"?
      "A small venue can look convincing without pretending it's a sold-out arena.":
      "Confirm the signed broadcast day and venue before we build the live package.";
   return {target,priority:facts.recentShows?"WATCH":"CLEAR",
    message:facts.recentShows?
     count(facts.recentShows,"recent show delivered","recent shows delivered")+
      ". "+focus+" My production craft can trim a capped share of actual show costs, not create viewers.":
     "No recent completed show to assess. "+focus+" I can only improve a production that actually takes place."};
  }
  case "TRAINER":
   return {target,priority:facts.fatigueConcerns?"WATCH":"CLEAR",
    message:facts.fatigueConcerns?
     count(facts.fatigueConcerns,"wrestler has","wrestlers have")+
      " high fatigue. "+proposal({
       FRANK:"Give them rest, not another punishing session.",
       PATIENT:"Work back gradually; one week's recovery won't erase every demanding booking.",
       AMBITIOUS:"Keep them fit for the next series of shows, not just a short-term appearance.",
       LOYAL:"A tired roster needs breathing room before adding physical training.",
       ECCENTRIC:"Fewer heroic sprints, more miles in the legs; recovery first."
      },"Ease the workload and let recovery accumulate.")+
      " My modest recovery support cannot clear medical restrictions.":
     "No high-fatigue cases in the current roster snapshot. "+
      "I can assist modest recovery, not grant new skills or replace Medical."};
  case "SCOUT":{
   const first=facts.scoutProspects[0];
   return {target,priority:first?"ACTION":"CLEAR",
    message:first?count(facts.scoutProspects.length,"eligible prospect","eligible prospects")+
      " in the current available-market shortlist, starting with "+
      trimmed(first.name)+". I'd compare their existing ring skills and development upside before you offer anything. "+
      "Nobody is signed just because I like them.":
     "The bounded available-market shortlist currently contains no eligible young prospects. "+
      "I won't pretend there's a hidden star until a new one is actually available."};
  }
 }
}
