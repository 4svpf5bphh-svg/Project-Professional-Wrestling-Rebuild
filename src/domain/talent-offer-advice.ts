/** An imperfect Talent Manager estimate, not the wrestler's acceptance logic.
 * Recommendations use public roster evidence and staff insight only; actual
 * decisions still use the original server-authoritative contract utility.
 */
import {minimumExclusiveWeeklyGuarantee,type OfferTerms,type Role,type Creative,type Stage,type Family} from "./contract-economics.js";
import {forecastContractCost} from "./contract-cost-forecast.js";
import type {WorldStaffMember} from "./world-staff.js";
export interface TalentOfferProfile{
 personId:string;name:string;marketWeeklyValue:number;
 popularity:number|null;recognition:number|null;morale:number|null;
 careerStage:Stage|string|null;
 age?:number|null;developmentAptitude?:number|null;
 division?:string|null;startWeekIndex?:number;
 interest:"KEEN"|"INTERESTED"|"OPEN_TO_TALKS"|"RELUCTANT"|"NOT_INTERESTED"|"UNKNOWN"|"UNAVAILABLE";
 /** Person-scoped, non-financial availability after other signed contracts. */
 remainingServiceDensityPerWeek?:number|null;
 purchasedDateLimits?:readonly number[]|null;
 exclusiveTermLimit?:number|null;
 preferredFamily?:Family;
 renewal?:boolean;
 budget?:TalentOfferBudget|null;
}
export interface TalentOfferBudget{
 cash:number;weeklyIncome:number|null;weeklyOverhead:number|null;
 weeklyGuarantees:number;weeklyStaffPayroll:number;
 weeklyWageLimit:number|null;cashReserve:number|null;
 showTalentLimit?:number|null;existingShowTalent?:number|null;
 releasedGuarantee?:number;
 rosterDepth?:{men:number;women:number};
 nextTV?:{name:string;weekIndex:number}|null;nextPPV?:{name:string;weekIndex:number}|null;
}
export interface TalentManagerProfile extends Partial<Pick<WorldStaffMember,"personality"|"specialism"|"people">>{
 staffId:string;name:string;insight:number;
}
export interface TalentOfferAdvice{
 terms:Omit<OfferTerms,"startWeekIndex">;
 feasible:boolean;
 voice:string;confidence:"CONFIDENT"|"MEASURED"|"SPECULATIVE";
 rationale:string;projectedCommitment:number;managerName:string;
 availability:string;willingness:string;affordability:string|null;
 bookingContext:string|null;
}
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const round50=(n:number)=>Math.max(0,Math.round(n/50)*50);
function stableNoise(a:string,b:string){
 let hash=2166136261;
 for(const c of a+":"+b){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619)}
 return (hash>>>0)/4294967295*2-1;
}
export function recommendTalentOffer(person:TalentOfferProfile,
 manager:TalentManagerProfile):TalentOfferAdvice{
 if(!person.personId||!person.name||!manager.staffId||
  !Number.isFinite(manager.insight)||manager.insight<0||manager.insight>100||
  !Number.isFinite(person.marketWeeklyValue)||person.marketWeeklyValue<0)
  throw new Error("Invalid talent recommendation evidence");
 const talent=Math.round(clamp((person.popularity??50)*.58+
  (person.recognition??50)*.42,0,100));
 const role:Role=talent>=87?"MAIN_EVENT":talent>=74?"UPPER_CARD":
  talent>=58?"FEATURED":talent>=40?"REGULAR":"DEVELOPMENTAL";
 const youngProspect=person.careerStage==="PROSPECT"&&
  person.age!=null&&person.age<=24;
 const preferredWeeks=person.careerStage==="SPECIAL_ATTRACTION"?12:
  youngProspect?26:
  talent>=63?52:talent>=40?26:12;
 const available=typeof person.remainingServiceDensityPerWeek==="number"&&
  Number.isFinite(person.remainingServiceDensityPerWeek)?
  Math.max(0,person.remainingServiceDensityPerWeek):null;
 // Use the same signed-service-density bound as original offer validation.
 // Never recommend 40 appearances when another employer already owns most
 // of the wrestler's calendar; no other employer's terms leave the server.
 const dateLimit=(weeks:number)=>person.purchasedDateLimits?.[weeks-1]??(available===null?null:
  Math.max(0,Math.floor(Math.max(0,available-.001)*weeks)));
 const budget=person.budget;
 const preferredFamily=person.preferredFamily??"LIMITED_NON_EXCLUSIVE";
 const exclusiveWeeks=Math.min(preferredWeeks,person.exclusiveTermLimit??0);
 const quitExclusive=preferredFamily==="EXCLUSIVE"&&exclusiveWeeks<1;
 const wantedWeeks=preferredFamily==="EXCLUSIVE"&&!quitExclusive?exclusiveWeeks:preferredWeeks;
 const otherTerms=Array.from({length:52},(_,i)=>i+1)
  .filter(weeks=>(dateLimit(weeks)??0)>0&&(weeks>1||!person.renewal))
  .sort((a,b)=>Math.abs(a-wantedWeeks)-Math.abs(b-wantedWeeks)||a-b);
 const fallbackWeeks=otherTerms[0];
 const contracted=preferredFamily==="EXCLUSIVE"&&!quitExclusive;
 const weeks=contracted||(dateLimit(wantedWeeks)??1)>0?wantedWeeks:fallbackWeeks??wantedWeeks;
 const family:Family=contracted?"EXCLUSIVE":weeks===1?"ONE_OFF":"LIMITED_NON_EXCLUSIVE";
 const knownTerms=contracted||dateLimit(weeks)!==null;
 const feasible=(contracted||(dateLimit(weeks)??1)>0)&&
  (person.interest!=="UNAVAILABLE"||knownTerms);
 const idealDates=weeks===52?40:weeks===26?20:Math.max(1,Math.round(weeks*.75));
 const safeDates=dateLimit(weeks);
 const dates=family==="EXCLUSIVE"?weeks:family==="ONE_OFF"?1:
  Math.max(1,Math.min(idealDates,safeDates??idealDates));
 const creative:Creative=family==="ONE_OFF"?"NONE":talent>=83?"PROTECTED_FINISHES":
  talent>=58?"CONSULTATION":"NONE";
 const interestMultiplier:Record<TalentOfferProfile["interest"],number>={
  KEEN:.86,INTERESTED:.95,OPEN_TO_TALKS:1.05,
  RELUCTANT:1.22,NOT_INTERESTED:1.42,UNKNOWN:1.12,UNAVAILABLE:1.5};
 const base=Math.max(500,person.marketWeeklyValue);
 // Staff insight scales estimation error. Strong managers are much closer
 // to the recommendation's evidence-centred wage; never reveal real utility.
 const error=stableNoise(person.personId,"negotiation")*
  (100-manager.insight)/100*.37;
 const estimate=clamp(base*interestMultiplier[person.interest]*(1+error),
  base*.45,base*1.85);
 const weeklyGuarantee=family==="EXCLUSIVE"?
  Math.max(minimumExclusiveWeeklyGuarantee(person.marketWeeklyValue),round50(estimate*.88)):
  family==="ONE_OFF"?0:round50(estimate*.24);
 const appearanceFee=family==="EXCLUSIVE"?0:round50(estimate*.83);
 const signingBonus=talent>=82&&!person.renewal?round50(estimate*.30):0;
 const terms={family,roleExpectation:role,creativeControl:creative,
  termWeeks:weeks,dateEntitlement:dates,
  weeklyGuarantee,appearanceFee,signingBonus};
 const cost=forecastContractCost({
  weeks,dates,weeklyGuarantee,appearanceFee,signingBonus});
 const confidence=manager.insight>=76&&person.interest!=="UNKNOWN"?
  "CONFIDENT":manager.insight>=52?"MEASURED":"SPECULATIVE";
 const priorities=creative==="PROTECTED_FINISHES"?
  "They may want protection over how they lose.":
  creative==="CONSULTATION"?
  "Offering a voice in their creative direction could help.":
  "I'd keep creative control straightforward.";
 const development=youngProspect&&person.developmentAptitude!=null&&
  person.developmentAptitude>=75?
  " Give them regular chances with experienced opponents and review their progress before extending.":"";
 const pay=family==="EXCLUSIVE"?"$"+weeklyGuarantee.toLocaleString("en-GB")+" a week":
  weeklyGuarantee>0?
  "$"+weeklyGuarantee.toLocaleString("en-GB")+
  " a week and $"+appearanceFee.toLocaleString("en-GB")+
  " per appearance":"$"+appearanceFee.toLocaleString("en-GB")+
  " per appearance";
 const confidencePhrase=confidence==="CONFIDENT"?"I'm reasonably confident":
  confidence==="MEASURED"?"My best estimate is":"This is a cautious opening offer";
 const term=family==="EXCLUSIVE"?weeks+" exclusive weeks":weeks+" weeks, "+dates+" dates";
 const personalityLead=manager.personality==="FRANK"?"Here's the offer I'd put on the table":
  manager.personality==="PATIENT"?"I'd open the talks with":
  manager.personality==="AMBITIOUS"?"I'd make a move with":
  manager.personality==="LOYAL"?"I'd give "+person.name+" some clarity with":
  manager.personality==="ECCENTRIC"?"Here's the deal I'd send through the curtain":
  confidencePhrase+" we should offer";
 const voice=!feasible?
  "I would not offer "+person.name+" another dates-based deal yet. "+
  "Their signed schedule leaves no room for a new appearance commitment at the next start week.":
  personalityLead+" "+(manager.personality==="LOYAL"?"":person.name+" ")+
  term+", "+pay+". "+priorities+development+
  (family!=="EXCLUSIVE"&&safeDates!==null&&safeDates<idealDates?
   " I've reduced the dates because other signed commitments occupy part of their calendar.":"");
 const rationale=!feasible?"The existing schedule does not support new purchased dates. Wait for availability or review an eligible alternative.":
  person.interest==="RELUCTANT"||person.interest==="NOT_INTERESTED"?
  "Interest is limited. A stronger offer may be needed.":
  confidence==="SPECULATIVE"?
  "Wrestler expectations are uncertain; be prepared to negotiate.":
  "This is a starting recommendation, not an acceptance guarantee.";
 const availability=!feasible?"No workable agreement from the proposed start. Check again after their signed commitments change.":
  quitExclusive?"Exclusive renewal conflicts with a signed agreement. This non-exclusive package fits the available dates.":
  weeks!==preferredWeeks?"The preferred term conflicts with the signed calendar. This term fits from the same start.":
  family==="EXCLUSIVE"?"No overlap in the recommended exclusive term.":
  "The recommended dates fit the available service at the proposed start.";
 const willingness=person.interest==="UNKNOWN"||person.interest==="UNAVAILABLE"?
  "Willingness is unconfirmed. The wrestler will consider the actual offer.":
  person.interest==="RELUCTANT"||person.interest==="NOT_INTERESTED"?
   "Interest is limited. Allow for a refusal and keep another option available.":
   "The wrestler may be open to talks. They still decide on the terms.";
 let affordability:string|null=null;
 if(feasible&&budget){
  const wages=Math.max(0,budget.weeklyGuarantees-(budget.releasedGuarantee??0))+weeklyGuarantee;
  if(budget.cash-signingBonus-weeklyGuarantee<(budget.cashReserve??0))
   affordability="Upfront pay would cut into available cash or the reserve. Compare a smaller bonus or a lower-cost candidate.";
  else if(budget.weeklyWageLimit!==null&&wages>budget.weeklyWageLimit)
   affordability="This exceeds your weekly wage policy. Compare a dates-only package or wait for an existing obligation to end.";
  else if(budget.showTalentLimit!=null&&appearanceFee+(budget.existingShowTalent??0)>budget.showTalentLimit)
   affordability="This appearance fee would put the next show above your talent limit. Use an existing roster booking or compare a less costly date.";
  else if(budget.weeklyIncome!==null&&budget.weeklyOverhead!==null&&
   wages+budget.weeklyStaffPayroll+budget.weeklyOverhead+cost.plannedAppearanceFees/weeks>budget.weeklyIncome)
   affordability="Dependable weekly income does not cover this plan before other show costs. Try a shorter exposure or compare a lower-cost wrestler.";
  else if(budget.weeklyIncome===null||budget.weeklyOverhead===null)
   affordability="Cash can cover the opening pay. Confirm regular income and overhead before relying on a long commitment.";
  else affordability="Opening pay and weekly commitments fit the known budget before other event expenses.";
 }
 const depth=budget?.rosterDepth;
 const thin=depth&&Math.abs(depth.men-depth.women)>=3&&
  (depth.men<depth.women?person.division==="MEN":person.division==="WOMEN");
 const plan=budget?.nextPPV??budget?.nextTV;
 const start=person.startWeekIndex;
 let bookingContext=thin?"They would add depth to the thinner division.":null;
 if(plan&&start!==undefined&&feasible){
  const fit=plan.weekIndex>=start&&plan.weekIndex<start+weeks;
  const timetable=fit?"The term covers the week of "+plan.name+". Check their show-day availability before booking.":
   plan.name+" falls outside this term. Keep an existing roster option ready.";
  bookingContext=bookingContext?bookingContext+" "+timetable:timetable;
 }
 return {terms,feasible,voice,confidence,rationale,availability,willingness,affordability,
  bookingContext,
  projectedCommitment:cost.plannedFullTermCost,managerName:manager.name};
}
