/** Pure injury-resolution slice from archived PPW matches.ts.
 * Injury is the sole legitimate medical override of a scripted result:
 * a serious injury to the intended winner forces referee stoppage and the
 * opponent wins. Never mistake this preview for a committed medical record.
 */
import {DeterministicRng} from "./rng.js";
import {scoreArchivedSinglesBeforeInjuriesWithRng,type ScoringInput,
  type ScoredWrestler,type PreliminaryMatchScore} from "./match-scoring.js";
import type {MatchStyleExecutionEvaluation} from "./match-style.js";
import type {MatchFinish} from "./match-finishes.js";

export type InjurySeverity="MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
export interface InjuryRecordPreview {
  personId:string;severity:InjurySeverity;weeksOut:number;probability:number;
}
export interface InjuryResolutionInput extends ScoringInput {
  personIds:readonly [string,string];
  bookedWinnerId:string;
  injuryRateMultiplier:number;
}
export interface InjuryResolutionPreview {
  stage:"POST_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW";
  preInjury:PreliminaryMatchScore;
  injuries:InjuryRecordPreview[];
  injuryStoppage:boolean;
  plannedWinnerId:string;actualWinnerId:string;
  plannedFinish:MatchFinish;actualFinish:MatchFinish;
  crowdResponse:number;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));

function injuryProbability(input:InjuryResolutionInput,person:ScoredWrestler,
  allPeople:readonly ScoredWrestler[]):number {
  const avgSafety=allPeople.reduce((sum,p)=>sum+p.skills.safety,0)/allPeople.length;
  const intentRisk=input.intent==="HIGH_RISK"?0.006:input.intent==="EPIC"?0.0024:
    input.intent==="TECHNICAL"?0.0012:0.0007;
  const fatigueRisk=person.fatigue/18000;
  const wearRisk=person.wear/22000;
  const safetyRisk=Math.max(0,70-avgSafety)/9000;
  const lengthRisk=Math.max(0,input.plannedLengthMinutes-15)/12000;
  return clamp((0.0007+intentRisk+fatigueRisk+wearRisk+safetyRisk+lengthRisk)*
    input.injuryRateMultiplier,0.0002,0.035);
}
function styledInjuryProbability(input:InjuryResolutionInput,person:ScoredWrestler,
  allPeople:readonly ScoredWrestler[],styleEvaluation:MatchStyleExecutionEvaluation):number {
  const style=input.style!;
  const avgSafety=allPeople.reduce((sum,p)=>sum+p.skills.safety,0)/allPeople.length;
  const styleRisk=0.0005
    +Math.pow(style.risk/100,2)*0.005
    +Math.pow(style.intensity/100,2)*0.0014
    +Math.max(0,styleEvaluation.load.physical-70)/12000;
  const fatigueRisk=person.fatigue/18000;
  const wearRisk=person.wear/22000;
  const safetyRisk=Math.max(0,70-avgSafety)/9000;
  const lengthRisk=Math.max(0,input.plannedLengthMinutes-15)/12000;
  return clamp((styleRisk+fatigueRisk+wearRisk+safetyRisk+lengthRisk)*
    input.injuryRateMultiplier,0.0002,0.035);
}
function injurySeverity(rng:DeterministicRng):{severity:InjurySeverity;weeksOut:number}{
  const roll=rng.next();
  if(roll<0.56)return {severity:"MINOR",weeksOut:rng.int(1,2)};
  if(roll<0.86)return {severity:"MODERATE",weeksOut:rng.int(2,5)};
  if(roll<0.97)return {severity:"MAJOR",weeksOut:rng.int(5,10)};
  return {severity:"SEVERE",weeksOut:rng.int(10,18)};
}
/** Consume original RNG draws in original order, including severity and
 * weeks-out draws. This is preview-only until World-authoritative recording.
 */
export function previewArchivedInjuryStoppage(input:InjuryResolutionInput):InjuryResolutionPreview {
  if(!input.personIds[0]||!input.personIds[1]||
    input.personIds[0]===input.personIds[1]||
    !input.personIds.includes(input.bookedWinnerId)||
    !Number.isFinite(input.injuryRateMultiplier)||input.injuryRateMultiplier<0||
    input.injuryRateMultiplier>10)
    throw new Error("Invalid booked winner, wrestler identity or injury rate");
  const {score,rng,styleEvaluation}=scoreArchivedSinglesBeforeInjuriesWithRng(input);
  const injuries:InjuryRecordPreview[]=[];
  for(let i=0;i<input.people.length;i++){
    const person=input.people[i]!,personId=input.personIds[i]!;
    const probability=styleEvaluation===null?
      injuryProbability(input,person,input.people):
      styledInjuryProbability(input,person,input.people,styleEvaluation);
    if(!rng.chance(probability))continue;
    injuries.push({personId,...injurySeverity(rng),probability});
  }
  const stoppage=injuries.some(i=>i.personId===input.bookedWinnerId &&
    (i.severity==="MAJOR"||i.severity==="SEVERE"));
  const actualWinnerId=stoppage?
    input.personIds.find(id=>id!==input.bookedWinnerId)!:input.bookedWinnerId;
  const crowdResponse=stoppage?
    Math.round(clamp(score.crowdResponse-4,0,100)*10)/10:score.crowdResponse;
  return {stage:"POST_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW",preInjury:score,
    injuries,injuryStoppage:stoppage,
    plannedWinnerId:input.bookedWinnerId,actualWinnerId,
    plannedFinish:input.plannedFinish,
    actualFinish:stoppage?"INJURY_STOPPAGE":input.plannedFinish,crowdResponse};
}
