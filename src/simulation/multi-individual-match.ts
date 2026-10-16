/** 3/4 independent opponents, no elimination or time stagger.
 * ALL athletes contribute to the archived scoring averages, with an
 * additional deterministic per-wrestler medical exposure and career result.
 * No two-sided run-in is interpreted as a three/four-way interference.
 */
import type {CanonicalMatchLayout,MatchSideId} from "../domain/match-sides.js";
import {scoreArchivedFieldBeforeInjuriesWithRng,type ScoredWrestler}
 from "./legacy/match-scoring.js";
import type {MatchIntent} from "./legacy/types.js";
import type {MatchFinish} from "./legacy/match-finishes.js";
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round1=(n:number)=>Math.round(n*10)/10;
const round2=(n:number)=>Math.round(n*100)/100;
export interface MultiIndividualInput{
 layout:CanonicalMatchLayout;
 wrestlers:ReadonlyMap<string,ScoredWrestler>;
 worldSeed:string;matchId:string;order:number;eventImportance:number;
 intent:MatchIntent;plannedFinish:MatchFinish;plannedLengthMinutes:number;
 injuryRateMultiplier:number;mediaReach:number;isMainEvent:boolean;
}
export function simulateMultiIndividualMatch(input:MultiIndividualInput){
 const {layout}=input;
 if(layout.family!=="INDIVIDUAL"||
  ![3,4].includes(layout.sides.length)||
  layout.sides.some(s=>s.participants.length!==1)||
  !Number.isFinite(input.injuryRateMultiplier)||
  input.injuryRateMultiplier<0||input.injuryRateMultiplier>10||
  !Number.isFinite(input.mediaReach)||input.mediaReach<0||input.mediaReach>1000000)
  throw new Error("Multi-person scoring accepts only three/four solo competitors");
 const ids=layout.participants.map(p=>p.personId);
 const people=ids.map(id=>{
  const p=input.wrestlers.get(id);
  if(!p)throw new Error("Missing multi-person wrestler attributes");
  return p;
 });
 const {score,rng}=scoreArchivedFieldBeforeInjuriesWithRng({
  worldSeed:input.worldSeed,matchId:input.matchId,order:input.order,
  eventImportance:input.eventImportance,intent:input.intent,
  style:null,plannedFinish:input.plannedFinish,
  plannedLengthMinutes:input.plannedLengthMinutes,chemistryModifier:0,people,
 });
 const injuries: {personId:string;severity:"MINOR"|"MODERATE"|"MAJOR"|"SEVERE";
  weeksOut:number}[]=[];
 for(let i=0;i<people.length;i++){
  const p=people[i]!;
  const intentRisk=input.intent==="HIGH_RISK"?.006:
   input.intent==="EPIC"?.0024:input.intent==="TECHNICAL"?.0012:.0007;
  const probability=clamp((.001+intentRisk+p.fatigue/18000+
   p.wear/22000+Math.max(0,70-p.skills.safety)/9000+
   Math.max(0,input.plannedLengthMinutes-15)/12000+
   (people.length-2)*.0009)*input.injuryRateMultiplier,.0002,.045);
  if(!rng.chance(probability))continue;
  const roll=rng.next();
  const severity=roll<.56?"MINOR":roll<.86?"MODERATE":
   roll<.97?"MAJOR":"SEVERE";
  const weeksOut=severity==="MINOR"?rng.int(1,2):
   severity==="MODERATE"?rng.int(2,5):
   severity==="MAJOR"?rng.int(5,10):rng.int(10,18);
  injuries.push({personId:ids[i]!,severity,weeksOut});
 }
 const plannedSide=layout.scriptedWinnerSide;
 const plannedIndex=layout.sides.findIndex(x=>x.sideId===plannedSide);
 const injuredWinner=injuries.find(x=>x.personId===ids[plannedIndex]&&
  (x.severity==="MAJOR"||x.severity==="SEVERE"));
 // The medical stoppage alternate is explicit and deterministic: strongest
 // eligible booked opponent on the same card, NOT a new random winner.
 const strongest=people.map((p,i)=>({i,rank:p.skills.inRingQuality*.45+
  p.momentum*.3+p.skills.stamina*.25})).filter(x=>x.i!==plannedIndex)
  .sort((a,b)=>b.rank-a.rank||a.i-b.i)[0]!;
 const actualIndex=injuredWinner?strongest.i:plannedIndex;
 const actualWinnerSide=layout.sides[actualIndex]!.sideId;
 const actualFinish=injuredWinner?"INJURY_STOPPAGE":input.plannedFinish;
 const crowdResponse=injuredWinner?round1(clamp(score.crowdResponse-4,0,100)):
  score.crowdResponse;
 const members=people.map((p,i)=>{
  const injury=injuries.find(x=>x.personId===ids[i])??null;
  const won=i===actualIndex;
  const baseLoad=score.actualLengthMinutes*
   (input.intent==="HIGH_RISK"?.7:input.intent==="EPIC"?.61:.47)*
   (1.15-p.skills.stamina/220);
  const fatigueFloor=injury?
   ({MINOR:35,MODERATE:50,MAJOR:65,SEVERE:80})[injury.severity]:0;
  const injuryWear=injury?
   ({MINOR:.5,MODERATE:1.5,MAJOR:3,SEVERE:5})[injury.severity]:0;
  const wear=score.actualLengthMinutes*
   (input.intent==="HIGH_RISK"?.018:input.intent==="EPIC"?.012:.008)*
   (1.15-p.skills.safety/260);
  const momentumDelta=won?1.5:score.criticalRatingStars>=4?.3:-.4;
  const recognitionGain=(.025+input.mediaReach/3000+
   input.eventImportance/5000+(input.isMainEvent?.015:0))*
   Math.max(.08,1-p.recognition/108);
  const popularityGain=(Math.max(0,crowdResponse-55)/800+
   Math.max(0,score.criticalRatingStars-2.5)*.035+
   (won?.012:0))*Math.max(.12,1-p.popularity/108)-
   (score.criticalRatingStars<1.75?.02:0);
  return {personId:ids[i]!,sideId:layout.sides[i]!.sideId,
   won,injury,
   before:{fatigue:p.fatigue,wear:p.wear,momentum:p.momentum,
    recognition:p.recognition,popularity:p.popularity},
   after:{fatigue:round1(clamp(Math.max(p.fatigue,fatigueFloor)+baseLoad,0,100)),
    wear:round1(clamp(p.wear+injuryWear+wear,0,100)),
    momentum:round1(clamp(p.momentum+momentumDelta,0,100)),
    recognition:round2(clamp(p.recognition+recognitionGain,0,100)),
    popularity:round2(clamp(p.popularity+popularityGain,0,100))}};
 });
 return {score:{...score,crowdResponse},members,injuries,
  plannedWinnerSide:plannedSide,actualWinnerSide,actualFinish,
  injuryStoppage:Boolean(injuredWinner),
  medical:injuredWinner?{injuredPersonId:injuredWinner.personId,
   severity:injuredWinner.severity as "MAJOR"|"SEVERE",stoppage:true as const}:null};
}
