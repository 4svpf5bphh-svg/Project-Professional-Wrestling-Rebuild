/** Staff advice is a decision aid, not a simulated employee activity.
 * One pure projection of facts already returned by Staff Office: zero
 * additional SQL, model calls, invented story beats or automatic bookings.
 */
import type {StaffRole,WorldStaffMember} from "./world-staff.js";
import {deriveStaffRivalryObservations,type StaffRivalryEvidence}
 from "./verified-wrestler-rivalry-memory.js";
import {managementContractHorizon,managementWeek,type BackstageManagementContext}
 from "./backstage-management-context.js";

export type StaffMeetingTarget="contracts"|"programmes"|"roster"|"staff"|"gorilla"|"market";
export interface StaffMeetingFacts{
 renewals:readonly {personName:string;weeksRemaining:number}[];
 activeProgrammes:number;repeatedProgrammes:number;
 featuredProgramme:StaffRivalryEvidence|null;
 medicalRisks:number;medicalExample:string|null;fatigueConcerns:number;
 recentMatches:number;recentShows:number;recentDisqualifications:number;
 scoutLeads:readonly {name:string}[];
 managementCase?:StaffManagementCase|null;
 nextShow?:{name:string;weekIndex:number;premium:boolean;venue:string|null;
  venueCost:number|null;venueSuitability:number|null}|null;
 rosterDepth?:{men:number;women:number}|null;
 workload?:{name:string;fatigue:number;wear:number|null;clearanceWeek:number|null}|null;
}
export interface StaffManagementCase{
 personId:string;personName:string;conversationId:string;
 kind:"CONTRACT"|"MOMENTUM_OPPORTUNITY";
 context:BackstageManagementContext;
 renewalPending:boolean;renewalArranged:boolean;
 requestStatus?:string;nextShowCovered?:boolean|null;
}
export interface StaffMeetingBrief{
 message:string;nextStep:string;target:StaffMeetingTarget;
 urgency:"ACTION"|"WATCH"|"CLEAR";
 conversationId?:string;
}
/** These are actual working mechanics, not promises about future results. */
export const STAFF_PURPOSE:Record<StaffRole,{
 responsibility:string;effect:string;boundary:string
}>={
 TALENT_MANAGER:{responsibility:"Contracts and talent relations",
  effect:"Estimates realistic terms and can prepare same-terms renewals when delegated.",
  boundary:"An offer is not an acceptance; existing wrestler commitments still apply."},
 ROAD_AGENT:{responsibility:"Match structure and Gorilla Position",
  effect:"Reviews match pacing and execution; a skilled agent modestly helps live presentation.",
  boundary:"Never changes your scripted winners or the booked finish."},
 MEDICAL:{responsibility:"Fitness, availability and workload",
  effect:"Flags recorded injuries, fatigue and risky physical booking.",
  boundary:"Cannot declare an injured wrestler cleared or remove an actual injury."},
 CREATIVE:{responsibility:"Storylines, characters and on-screen chapters",
  effect:"Reviews aired storyline progress and warns about repetition.",
  boundary:"A suggested turn, alliance or payoff is not a booked or certified event."},
 COMMENTATOR:{responsibility:"Broadcast voice and continuity",
  effect:"Helps live presentation and keeps calls aligned with aired events.",
  boundary:"Does not invent a rivalry, announce a title change or change match outcomes."},
 REFEREE:{responsibility:"Match legality and finish execution",
  effect:"Briefs complex layouts and difficult finishes; can modestly improve live presentation.",
  boundary:"A referee does not choose a winner or overturn the booked decision."},
 PRODUCTION:{responsibility:"Show costs and delivery",
  effect:"A skilled producer can reduce existing production costs by up to 6%.",
  boundary:"Venue, date and broadcast rights still require a real booking or agreement."},
 TRAINER:{responsibility:"Conditioning and recovery",
  effect:"Adds a limited fatigue-recovery benefit to eligible contracted wrestlers.",
  boundary:"Does not increase innate ring skill or bypass medical clearance."},
 SCOUT:{responsibility:"Discovering affordable talent",
  effect:"Shortlists two or three real available prospects using scouting specialism.",
  boundary:"A scout never signs somebody or guarantees their future potential."}
};
const count=(n:number)=>Math.max(0,Math.trunc(n));
/** A report must tell the booker what was actually observed AND what to do.
 * Clear desks can say so without manufacturing an issue for their salary.
 */
export function staffMeetingBrief(role:StaffRole,f:StaffMeetingFacts,
 member?:Pick<WorldStaffMember,"personality"|"insight"|"craft"|"people"|"reliability"|"specialism">):StaffMeetingBrief{
 const story=deriveStaffRivalryObservations(f.featuredProgramme);
 const repeated=count(f.repeatedProgrammes),active=count(f.activeProgrammes);
 const injuries=count(f.medicalRisks),tired=count(f.fatigueConcerns);
 const leads=f.scoutLeads.slice(0,3);
 const discussion=f.managementCase;
 const context=discussion?.context;
 const nextShow=f.nextShow;
 const nextNeedsCover=context&&nextShow&&
  (discussion?.nextShowCovered===false||
   (discussion?.nextShowCovered==null&&(nextShow.weekIndex>context.contractExpires||context.remainingDates===0)));
 const work=f.workload;
 const ambitious=member?.personality==="AMBITIOUS";
 switch(role){
 case "TALENT_MANAGER":{
  if(discussion?.kind==="CONTRACT"&&context){
   const risk=discussion.personName+(discussion.renewalArranged?" has signed follow-on terms.":
    discussion.renewalPending?" has a renewal offer awaiting a decision.":
    " asked about their future. "+managementContractHorizon(context))+
    (context.programmeId?" They're part of an active Programme.":"");
   return {target:"contracts",conversationId:discussion.conversationId,
    urgency:nextNeedsCover&&!discussion.renewalPending?"ACTION":
     discussion.renewalArranged||discussion.renewalPending?"WATCH":"ACTION",message:risk,
    nextStep:discussion.renewalArranged?
     (nextNeedsCover?"The signed windows leave "+nextShow.name+" uncovered. Plan an alternative appearance.":
      discussion.nextShowCovered?"The signed dates cover "+nextShow?.name+". Follow the current booking plan.":
      "Check the signed dates against the next card once its date is set.") :
     discussion.renewalPending?"We've opened talks. Keep a version of the next card that works if the offer is turned down.":
     nextNeedsCover?"Check actual terms before committing "+nextShow.name+" to them. Keep an alternate chapter ready.":
     member?.specialism==="contract trust"||member?.people&&member.people>=72?
      (discussion.requestStatus==="PENDING"?"Reply to them directly, then discuss a package that covers the story's remaining dates.":
       "Continue the discussion in Contract Desk when you have dates and terms to offer.") :
      "Count the appearances you need. Compare an addendum with renewal terms before committing more of the card."};
  }
  const first=f.renewals[0];
  return first?{target:"contracts",urgency:"ACTION",
   message:first.personName+" is first of "+f.renewals.length+
    " signed deals due within twelve weeks.",
   nextStep:"Check the next show date against their current and proposed contract. "+
    "Quote only appearance dates they can actually commit to; then decide whether to send the renewal."}:
   {target:"contracts",urgency:"CLEAR",
    message:"No signed wrestler agreement is due in the next twelve weeks.",
    nextStep:"There's no urgent renewal to chase. Leave the terms alone unless your next card needs extra dates."};
 }
 case "ROAD_AGENT":
  if(discussion&&context&&context.strongMatches>=2){
   const depth=member&&(member.craft>=72||member.insight>=72);
   return {target:"gorilla",urgency:"WATCH",conversationId:discussion.conversationId,
    message:discussion.personName+" helped deliver "+context.strongMatches+
     " recent shows with strong execution and crowd response.",
    nextStep:nextNeedsCover?"Keep a different performer ready for "+nextShow.name+
     ". This run is worth building on when the dates are in place.":
    depth?(member.specialism==="tag wrestling"?
     "Give them a clear turning point with an established partner if the pairing is available.":
     "Test whether the audience follows them into a match with different stakes. Keep the length close to what has worked.") :
     "Give their next available appearance a clear purpose and see how the room responds."};
  }
  return story.roadAgent?{target:"gorilla",urgency:"WATCH",
   message:story.roadAgent,
   nextStep:"If these wrestlers meet again, I'll review pacing and the planned finish at Gorilla. "+
    "A new slot or a different opponent is your decision, not mine."}:
   {target:"gorilla",urgency:"CLEAR",
    message:count(f.recentMatches)>0?
     "We've completed "+count(f.recentMatches)+" matches in the recent show window.":
     "There isn't a completed match to review yet.",
    nextStep:"Bring me the next actual match card. I'll check its time, legal finish and pacing, "+
     "without changing the winner you booked."};
 case "MEDICAL":
  if(work?.clearanceWeek!=null)return {target:"roster",urgency:"ACTION",
   message:work.name+" has a recorded medical absence through the week before "+
    managementWeek(work.clearanceWeek)+".",
   nextStep:"Keep physical work off the card until roster clearance. Check fatigue and wear before planning their first match back."};
  return injuries?{target:"roster",urgency:"ACTION",
   message:injuries+" contracted wrestler"+(injuries===1?" is":"s are")+
    " medically unavailable"+(f.medicalExample?", including "+f.medicalExample:"")+".",
   nextStep:"Check the recorded clearance dates before booking any physical work. "+
    "We can't make the injury disappear by writing a different angle."}:
   tired?{target:"roster",urgency:"WATCH",
    message:tired+" contracted wrestler"+(tired===1?" is":"s are")+
     " above the high-fatigue watch threshold. They are not necessarily injured.",
    nextStep:"Review their coming physical appearances; a shorter match or a lighter week "+
     "is safer than assuming full fitness."}:
   {target:"roster",urgency:"CLEAR",
    message:"No recorded medical absence or high-fatigue threshold currently needs intervention.",
    nextStep:"No emergency briefing. I'll reassess when a demanding stipulation or workload is booked."};
 case "CREATIVE":
  if(discussion&&context&&(context.programmeId||context.strongMatches>=2)){
   const chapter=context.lastChapterWeek!==null?
    " The last certified chapter was "+managementWeek(context.lastChapterWeek)+".":"";
   const direction=context.programmeId?
    ambitious&&nextShow?.premium?"Write a payoff that could carry "+nextShow.name+" once the cast's dates are confirmed.":
     "Develop one fresh chapter around the current cast. An interview can advance the story without a repeat bout.":
    ambitious?"Give them an earned step towards contender status. Start with a match that tests that case.":
     "Try a short character scene that shows what they want. Give it time before committing to a long arc.";
   return {target:"programmes",urgency:nextNeedsCover?"ACTION":"WATCH",conversationId:discussion.conversationId,
    message:discussion.personName+(context.programmeId?
     " has an active Programme."+chapter:" has been getting a response in certified matches and has no active Programme."),
    nextStep:nextNeedsCover?"Finish the next beat within the dates already signed, or write it around another available participant.":direction};
  }
  return story.creative?{target:"programmes",urgency:repeated?"ACTION":"WATCH",
   message:story.creative,
   nextStep:repeated?
    "We've also repeated "+repeated+" active programme"+(repeated===1?"":"s")+
    ". I'd write one different on-screen development before booking another identical scene.":
    "Pick a next beat that changes what the audience knows. It can stay a solo story; "+
    "a new opponent is optional, never assumed."}:
   repeated?{target:"programmes",urgency:"ACTION",
    message:repeated+" active programme"+(repeated===1?" has":"s have")+
     " repeated recent chapters without enough change.",
    nextStep:"Choose a fresh motivation, a new kind of scene or a booked ending, "+
     "not the same confrontation with a new headline."}:
   {target:"programmes",urgency:"CLEAR",
    message:active?active+" active stories are running. No repetition alert is recorded.":
     "There isn't an active story to develop yet.",
    nextStep:active?
     "Follow up one actual aired chapter; don't promise a result before it's booked.":
     "A character interview, relationship or faction story can start without forcing a rivalry."};
 case "COMMENTATOR":
  return story.commentary?{target:"programmes",urgency:"WATCH",
   message:story.commentary,
   nextStep:"Give the next broadcast one honest callback to the actual scene; "+
    "let the new action earn its own reaction, instead of explaining an imaginary history."}:
   {target:"programmes",urgency:"CLEAR",
    message:active?active+" active stories give our broadcast continuity to track.":
     "No active storyline is established for commentary to recall.",
    nextStep:"Call the booked people and the actual finish. We'll build context as events air."};
 case "REFEREE":
  return count(f.recentDisqualifications)?{target:"gorilla",urgency:"WATCH",
   message:count(f.recentDisqualifications)+" disqualification finish"+
    (f.recentDisqualifications===1?"":"es")+" in the recent nine-week window.",
   nextStep:"For another DQ or referee bump, tell us exactly who the official sees "+
    "and how the decision happens. We won't improvise a different winner."}:
   {target:"gorilla",urgency:"CLEAR",
    message:"No recent completed disqualification needs a follow-up.",
    nextStep:"If the next card has interference, a referee bump or multiple legal wrestlers, "+
     "brief the exact finish before showtime."};
 case "PRODUCTION":
  if(nextShow)return {target:"gorilla",urgency:nextShow.venue?"WATCH":"ACTION",
   message:nextShow.name+(nextShow.venue?" is booked at "+nextShow.venue+
    (nextShow.venueCost===null?".":" with a $"+nextShow.venueCost.toLocaleString("en-GB")+" venue charge."):
    " still needs a venue."),
   nextStep:nextShow.venueSuitability!==null&&nextShow.venueSuitability<55?
    "Keep the production setup simple at this venue. Compare a better-equipped room before paying for extra presentation.":
    "Confirm the running order and keep the venue and production quote within the event budget."};
  return {target:"staff",urgency:count(f.recentShows)>0?"WATCH":"CLEAR",
   message:count(f.recentShows)>0?
    "We've delivered "+count(f.recentShows)+" shows in the recent nine-week window.":
    "There is no completed show in the recent production window.",
   nextStep:"Confirm venue, date and broadcast requirements on the real card. "+
    "My production efficiencies save costs; they don't reserve a venue for you."};
 case "TRAINER":
  if(work&&work.clearanceWeek===null&&work.fatigue>=65)
   return {target:"roster",urgency:"WATCH",
    message:work.name+" is carrying high fatigue"+(work.wear!=null&&work.wear>=72?" and accumulated wear.":"."),
    nextStep:"Give them a lighter schedule and reassess before increasing their workload. Use eligible prospects for supervised ring time."};
  return tired?{target:"roster",urgency:"WATCH",
   message:tired+" roster member"+(tired===1?" is":"s are")+
    " above the high-fatigue watch threshold.",
   nextStep:"My recovery work helps a little between weeks. A lighter physical schedule "+
    "does more than asking a tired wrestler for another marathon."}:
   {target:"roster",urgency:"CLEAR",
    message:"No active contracted wrestler is above the high-fatigue watch threshold.",
    nextStep:"Conditioning continues, but there is no recorded crisis to invent this week."};
 case "SCOUT":
  return leads.length?{target:"market",urgency:"WATCH",
   message:"I have "+leads.length+" actual available prospect"+
    (leads.length===1?"":"s")+" on my shortlist: "+
    leads.map(x=>x.name).join(", ")+".",
   nextStep:f.rosterDepth&&Math.min(f.rosterDepth.men,f.rosterDepth.women)>0&&
    Math.abs(f.rosterDepth.men-f.rosterDepth.women)>=3?
    "Your "+(f.rosterDepth.men<f.rosterDepth.women?"men's":"women's")+
    " division has fewer available wrestlers. Check the shortlist for a fit and review their actual terms.":
    "Compare their strongest skill with your next roster need, then check their actual terms in the Talent Market."}:
   {target:"market",urgency:"CLEAR",
    message:"No unattached young prospect qualifies for this week's scout shortlist.",
    nextStep:"No invented hot tip. Check again when the available market changes."};
 }
}
