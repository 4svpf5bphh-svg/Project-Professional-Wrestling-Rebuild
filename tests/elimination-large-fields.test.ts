import assert from "node:assert/strict";
import test from "node:test";
import {readCanonicalMatchLayout,requireSupportedScoringLayout,sideIdAt}
 from "../src/domain/match-sides.js";
import {simulateMultiIndividualMatch} from "../src/simulation/multi-individual-match.js";
import {simulateBookedTagMatch} from "../src/simulation/tag-match-simulation.js";
import {verifyMultiIndividualEvidence} from "../src/domain/verified-multi-individual.js";
import {verifyResolvedTeamEvidence} from "../src/domain/verified-team-evidence.js";
import type {ScoredWrestler} from "../src/simulation/legacy/match-scoring.js";
const person=(id:string)=>({personId:id,contractId:"deal-"+id});
const roster=new Map(Array.from({length:30},(_,i)=>{
 const p:ScoredWrestler={skills:{inRingQuality:70+i/2,matchCraft:77,
  presentation:73,stamina:87,safety:95},fatigue:8,wear:6,
  momentum:72,popularity:66,recognition:70};
 return ["p"+i,p] as const;
}));
const common={worldSeed:"11",matchId:"show:one",order:1,eventImportance:84,
 intent:"EPIC" as const,plannedFinish:"CLEAN_PIN" as const,
 plannedLengthMinutes:24,injuryRateMultiplier:0,mediaReach:80,isMainEvent:true};
test("30-entrant royal retains authored elimination order and winner through scoring and verification",()=>{
 const participants=Array.from({length:30},(_,i)=>person("p"+i));
 const sides=participants.map((p,i)=>({sideId:sideIdAt(i),participants:[p]}));
 const eliminationOrder=sides.slice(0,-1).map(x=>x.sideId);
 const booking={matchType:"BATTLE_ROYAL",family:"INDIVIDUAL",participants,
  sides,scriptedWinnerSide:"AD",scriptedWinner:"p29",ruleset:"ELIMINATION",
  eliminationOrder,plannedFinish:"OVER_THE_TOP_ROPE"};
 const layout=readCanonicalMatchLayout(booking);
 assert.equal(requireSupportedScoringLayout(layout),"BATTLE_ROYAL");
 assert.equal(layout.participants.length,30);
 const result=simulateMultiIndividualMatch({...common,layout,wrestlers:roster});
 assert.deepEqual(result,simulateMultiIndividualMatch({...common,layout,wrestlers:roster}));
 assert.equal(result.members.length,30);
 assert.equal(result.members.filter(x=>x.won).length,1);
 assert.equal(result.actualWinnerSide,result.injuryStoppage?result.actualWinnerSide:"AD");
 assert.equal(result.actualFinish,result.injuryStoppage?"INJURY_STOPPAGE":"OVER_THE_TOP_ROPE");
 assert.deepEqual(result.completedEliminationOrder,result.injuryStoppage?[]:eliminationOrder);
 const evidence={family:"INDIVIDUAL" as const,participants:participants.map(x=>x.personId),
  scriptedWinnerSide:"AD",plannedFinish:"OVER_THE_TOP_ROPE",ruleset:"ELIMINATION" as const,
  eliminationOrder};
 assert.deepEqual(verifyMultiIndividualEvidence(evidence,{
  actualWinnerSide:result.actualWinnerSide,actualFinish:result.actualFinish,
  completedEliminationOrder:result.completedEliminationOrder,
  ...(result.medical?{medical:result.medical}:{})}),{
   actualWinnerSide:result.actualWinnerSide,actualFinish:result.actualFinish});
 assert.throws(()=>readCanonicalMatchLayout({...booking,
  eliminationOrder:[...eliminationOrder.slice(0,-1),"AD"]}),/Eliminations/);
 assert.throws(()=>readCanonicalMatchLayout({...booking,
  eliminationOrder:[...eliminationOrder.slice(0,-1),eliminationOrder[0]]}),/Eliminations/);
 assert.throws(()=>readCanonicalMatchLayout({...booking,participants:participants.slice(0,29)}));
 assert.throws(()=>readCanonicalMatchLayout({...booking,
  participants:[...participants,person("p30")]}),/Too many|Invalid/);
 assert.throws(()=>verifyMultiIndividualEvidence(evidence,{
  actualWinnerSide:"AD",actualFinish:"OVER_THE_TOP_ROPE",
  completedEliminationOrder:[...eliminationOrder].reverse()}),/eliminations/);
});
test("2v2v2 elimination and six-team 5v5v5v5v5v5 score every member and verify authored finish",()=>{
 for(const [teams,size] of [[3,2],[6,5]]){
  const participants=Array.from({length:teams*size},(_,i)=>person("p"+i));
  const sides=Array.from({length:teams},(_,i)=>({
   sideId:sideIdAt(i),participants:participants.slice(i*size,(i+1)*size)}));
  const eliminationOrder=sides.filter(x=>x.sideId!=="B").map(x=>x.sideId);
  const booking={matchType:"TAG",family:"TEAMS",participants,sides,
   scriptedWinnerSide:"B",ruleset:"ELIMINATION",eliminationOrder,
   plannedFinish:"CLEAN_PIN"};
  const layout=readCanonicalMatchLayout(booking);
  assert.equal(requireSupportedScoringLayout(layout),"MULTI_TEAM");
  const result=simulateBookedTagMatch({...common,layout,wrestlers:roster,
   chemistryModifier:1});
  assert.deepEqual(result,simulateBookedTagMatch({...common,layout,wrestlers:roster,
   chemistryModifier:1}));
  assert.equal(result.members.length,teams*size);
  assert.equal(result.members.filter(m=>m.won).length,size);
  const winningInjury=result.injury.injuries.find(x=>
   ["MAJOR","SEVERE"].includes(x.severity)&&
   layout.sides[1]!.participants.some(p=>p.personId===x.personId));
  assert.deepEqual(verifyResolvedTeamEvidence({
   family:"TEAMS",sides:layout.sides.map(x=>({sideId:x.sideId,
    participants:x.participants.map(p=>p.personId)})),
   scriptedWinnerSide:"B",plannedFinish:"CLEAN_PIN",
   ruleset:"ELIMINATION",eliminationOrder},{
   actualWinnerSide:result.actualWinnerSide,actualFinish:result.final.actualFinish,
   completedEliminationOrder:result.completedEliminationOrder,
   ...(winningInjury?{medical:{injuredPersonId:winningInjury.personId,
    severity:winningInjury.severity as "MAJOR"|"SEVERE",stoppage:true as const}}:{})
  }),{actualWinnerSide:result.actualWinnerSide,actualFinish:result.final.actualFinish});
  assert.throws(()=>simulateBookedTagMatch({...common,layout,wrestlers:roster,
   chemistryModifier:1,interference:{personId:"p0",aidedSide:"A",
    plannedOutcome:"SUCCESS"}}),/Multi-team run-ins/);
 }
});
