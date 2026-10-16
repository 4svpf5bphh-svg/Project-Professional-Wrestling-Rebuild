/** Deterministic 2v2 simulation slice. Every member is evaluated and
 * injured individually; scripted winning TEAM remains canonical unless a
 * serious medical incident to that team requires a stoppage.
 * Reuses archived PPW quality/crowd equations on both side-average profiles.
 */
import type {CanonicalMatchLayout} from "../domain/match-sides.js";
import {scoreArchivedSinglesBeforeInjuriesWithRng,type ScoredWrestler,
 type ScoringInput} from "./legacy/match-scoring.js";
import type {MatchIntent} from "./legacy/types.js";
import type {MatchFinish} from "./legacy/match-finishes.js";
import type {InjuryResolutionPreview,InjuryRecordPreview} from "./legacy/match-injuries.js";
import {previewArchivedInterference,type BookedInterference,
 type InterfererReadiness} from "./legacy/match-interference.js";
export interface TagSimulationInput{
 layout:CanonicalMatchLayout;wrestlers:ReadonlyMap<string,ScoredWrestler>;
 worldSeed:string;matchId:string;order:number;eventImportance:number;
 intent:MatchIntent;plannedFinish:MatchFinish;plannedLengthMinutes:number;
 chemistryModifier:number;injuryRateMultiplier:number;
 interference?:BookedInterference|null;interferer?:InterfererReadiness|null;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const round1=(n:number)=>Math.round(n*10)/10;
function mean(xs:readonly number[]):number{return xs.reduce((a,b)=>a+b,0)/xs.length}
function average(team:readonly ScoredWrestler[]):ScoredWrestler{
 const s=team.map(p=>p.skills);
 return {skills:{
  inRingQuality:mean(s.map(x=>x.inRingQuality)),
  matchCraft:mean(s.map(x=>x.matchCraft)),
  presentation:mean(s.map(x=>x.presentation)),
  stamina:mean(s.map(x=>x.stamina)),
  safety:mean(s.map(x=>x.safety)),
 },popularity:mean(team.map(x=>x.popularity)),
 recognition:mean(team.map(x=>x.recognition)),
 momentum:mean(team.map(x=>x.momentum)),
 fatigue:mean(team.map(x=>x.fatigue)),wear:mean(team.map(x=>x.wear))};
}
export function simulateBookedTagMatch(input:TagSimulationInput){
 const {layout}=input;
 if(layout.family!=="TEAMS"||layout.sides.length!==2||
  layout.sides.some(x=>x.participants.length!==2)||
  !Number.isFinite(input.injuryRateMultiplier)||input.injuryRateMultiplier<0||
  input.injuryRateMultiplier>10)
  throw new Error("First team simulator only supports canonical 2v2");
 const ids=layout.sides.flatMap(x=>x.participants.map(p=>p.personId));
 const people=ids.map(id=>{
  const person=input.wrestlers.get(id);
  if(!person)throw new Error("Missing booked tag wrestler attributes");
  return person;
 });
 const teams=[people.slice(0,2),people.slice(2,4)] as
  [ScoredWrestler[],ScoredWrestler[]];
 const scoring:ScoringInput={
  worldSeed:input.worldSeed,matchId:input.matchId,order:input.order,
  eventImportance:input.eventImportance,intent:input.intent,style:null,
  plannedFinish:input.plannedFinish,plannedLengthMinutes:input.plannedLengthMinutes,
  chemistryModifier:input.chemistryModifier,
  people:[average(teams[0]),average(teams[1])],
 };
 const {score,rng}=scoreArchivedSinglesBeforeInjuriesWithRng(scoring);
 const avgSafety=mean(people.map(p=>p.skills.safety));
 const injuries:InjuryRecordPreview[]=[];
 for(let index=0;index<4;index++){
  const p=people[index]!,personId=ids[index]!;
  const intentRisk=input.intent==="HIGH_RISK"?.006:
   input.intent==="EPIC"?.0024:input.intent==="TECHNICAL"?.0012:.0007;
  const probability=clamp((.0007+intentRisk+p.fatigue/18000+
   p.wear/22000+Math.max(0,70-avgSafety)/9000+
   Math.max(0,input.plannedLengthMinutes-15)/12000)*
   input.injuryRateMultiplier,.0002,.035);
  if(!rng.chance(probability))continue;
  const roll=rng.next();
  const severity=roll<.56?"MINOR":roll<.86?"MODERATE":
   roll<.97?"MAJOR":"SEVERE";
  const weeksOut=severity==="MINOR"?rng.int(1,2):
   severity==="MODERATE"?rng.int(2,5):
   severity==="MAJOR"?rng.int(5,10):rng.int(10,18);
  injuries.push({personId,severity,weeksOut,probability});
 }
 const plannedSide=layout.scriptedWinnerSide;
 const opponentSide=layout.sides.find(x=>x.sideId!==plannedSide)!;
 const actualSide=injuries.some(i=>["MAJOR","SEVERE"].includes(i.severity)&&
   layout.sides.find(x=>x.sideId===plannedSide)!.participants
    .some(p=>p.personId===i.personId))?opponentSide.sideId:plannedSide;
 const injuryStoppage=actualSide!==plannedSide;
 const representative=(sideId:string)=>layout.sides.find(s=>s.sideId===sideId)!
  .participants[0]!.personId;
 const injury:InjuryResolutionPreview={
  stage:"POST_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW",
  preInjury:score,injuries,injuryStoppage,
  plannedWinnerId:representative(plannedSide),
  actualWinnerId:representative(actualSide),
  plannedFinish:input.plannedFinish,
  actualFinish:injuryStoppage?"INJURY_STOPPAGE":input.plannedFinish,
  crowdResponse:injuryStoppage?round1(clamp(score.crowdResponse-4,0,100)):score.crowdResponse,
 };
 const final=previewArchivedInterference(injury,
  input.interference??null,input.interferer??null);
 // Full four-person consequence summaries. These are immutable calculated
 // evidence until the generic career settlement writer is implemented.
 const winnerSide=injuryStoppage?actualSide:plannedSide;
 const members=ids.map((personId,i)=>{
  const person=people[i]!;
  const injuryRecord=injuries.find(x=>x.personId===personId)??null;
  const won=layout.sides.find(x=>x.participants.some(p=>p.personId===personId))!
   .sideId===winnerSide;
  const load=score.actualLengthMinutes*(input.intent==="HIGH_RISK"?.72:
   input.intent==="EPIC"?.62:.48)*(1.15-person.skills.stamina/220);
  const wear=score.actualLengthMinutes*(input.intent==="HIGH_RISK"?.018:
   input.intent==="EPIC"?.012:.008)*(1.15-person.skills.safety/260);
  const fatigueFloor=injuryRecord?
   ({MINOR:35,MODERATE:50,MAJOR:65,SEVERE:80})[injuryRecord.severity]:0;
  const injuryWear=injuryRecord?
   ({MINOR:.5,MODERATE:1.5,MAJOR:3,SEVERE:5})[injuryRecord.severity]:0;
  return {personId,sideId:layout.sides[Math.floor(i/2)]!.sideId,
   won,injury:injuryRecord,
   after:{fatigue:round1(clamp(Math.max(person.fatigue,fatigueFloor)+load,0,100)),
    wear:round1(clamp(person.wear+injuryWear+wear,0,100))}};
 });
 return {score,injury,final,members,actualWinnerSide:actualSide,
  plannedWinnerSide:plannedSide};
}
