/** An imperfect Talent Manager estimate, not the wrestler's acceptance logic.
 * Recommendations use public roster evidence and staff insight only; actual
 * decisions still use the original server-authoritative contract utility.
 */
import type {OfferTerms,Role,Creative,Stage,Family} from "./contract-economics.js";
import {forecastContractCost} from "./contract-cost-forecast.js";
export interface TalentOfferProfile{
 personId:string;name:string;marketWeeklyValue:number;
 popularity:number|null;recognition:number|null;morale:number|null;
 careerStage:Stage|string|null;
 interest:"KEEN"|"INTERESTED"|"OPEN_TO_TALKS"|"RELUCTANT"|"NOT_INTERESTED"|"UNKNOWN"|"UNAVAILABLE";
}
export interface TalentManagerProfile{staffId:string;name:string;insight:number}
export interface TalentOfferAdvice{
 terms:Omit<OfferTerms,"startWeekIndex">;
 voice:string;confidence:"CONFIDENT"|"MEASURED"|"SPECULATIVE";
 rationale:string;projectedCommitment:number;managerName:string;
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
 const weeks=person.careerStage==="SPECIAL_ATTRACTION"?12:
  talent>=63?52:talent>=40?26:12;
 const dates=weeks===52?40:weeks===26?20:9;
 const family:Family="LIMITED_NON_EXCLUSIVE";
 const creative:Creative=talent>=83?"PROTECTED_FINISHES":
  talent>=58?"CONSULTATION":"NONE";
 const interestMultiplier:Record<TalentOfferProfile["interest"],number>={
  KEEN:.86,INTERESTED:.95,OPEN_TO_TALKS:1.05,
  RELUCTANT:1.22,NOT_INTERESTED:1.42,UNKNOWN:1.12,UNAVAILABLE:1.5};
 const base=Math.max(500,person.marketWeeklyValue);
 // Staff insight scales estimation error. Strong managers are much closer
 // to the recommendation's evidence-centred wage; never reveal real utility.
 const error=stableNoise(person.personId,manager.staffId)*
  (100-manager.insight)/100*.37;
 const estimate=clamp(base*interestMultiplier[person.interest]*(1+error),
  base*.45,base*1.85);
 const weeklyGuarantee=round50(estimate*.24);
 const appearanceFee=round50(estimate*.83);
 const signingBonus=talent>=82?round50(estimate*.30):0;
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
 const pay=weeklyGuarantee>0?
  "$"+weeklyGuarantee.toLocaleString("en-GB")+
  " a week and $"+appearanceFee.toLocaleString("en-GB")+
  " per appearance":"$"+appearanceFee.toLocaleString("en-GB")+
  " per appearance";
 const confidencePhrase=confidence==="CONFIDENT"?"I'm reasonably confident":
  confidence==="MEASURED"?"My best estimate is":"This is a cautious opening offer";
 const voice=confidencePhrase+" we should offer "+person.name+" "+
  weeks+" weeks, "+dates+" dates, "+pay+". "+priorities;
 const rationale=person.interest==="RELUCTANT"||person.interest==="NOT_INTERESTED"?
  "Interest is limited. A stronger offer may be needed.":
  confidence==="SPECULATIVE"?
  "Wrestler expectations are uncertain; be prepared to negotiate.":
  "This is a starting recommendation, not an acceptance guarantee.";
 return {terms,voice,confidence,rationale,
  projectedCommitment:cost.plannedFullTermCost,managerName:manager.name};
}
