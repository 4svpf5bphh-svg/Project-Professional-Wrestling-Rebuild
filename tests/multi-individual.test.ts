import assert from "node:assert/strict";
import test from "node:test";
import {readCanonicalMatchLayout,requireSupportedScoringLayout}
 from "../src/domain/match-sides.js";
import {verifyMultiIndividualEvidence} from "../src/domain/verified-multi-individual.js";
import {simulateMultiIndividualMatch} from "../src/simulation/multi-individual-match.js";
import {validateCompletedMatchEvidence} from "../src/domain/completed-match-evidence.js";
import type {ScoredWrestler} from "../src/simulation/legacy/match-scoring.js";
const person=(id:string)=>({personId:id,contractId:"deal-"+id});
const roster=new Map(["a","b","c","d"].map((id,i)=>{
 const p:ScoredWrestler={
  skills:{inRingQuality:75+i,matchCraft:72+i,presentation:78,
   stamina:83,safety:92},
  popularity:60+i,recognition:65+i,momentum:66+i,fatigue:14,wear:10};
 return [id,p] as const;
}));
const make=(count:number,winner:string)=>{
 const people=["a","b","c","d"].slice(0,count);
 return readCanonicalMatchLayout({matchType:"SINGLES",family:"INDIVIDUAL",
  participants:people.map(person),
  sides:people.map((id,i)=>({sideId:"ABCD"[i],participants:[person(id)]})),
  scriptedWinnerSide:"ABCD"[people.indexOf(winner)],
  scriptedWinner:winner});
};
test("3/4 distinct individual sides are scored from ALL wrestlers and deterministic outcomes",()=>{
 for(const count of [3,4]){
  const layout=make(count,count===3?"c":"d");
  assert.equal(requireSupportedScoringLayout(layout),
   count===3?"TRIPLE_THREAT":"FOUR_WAY");
  const args={layout,wrestlers:roster,worldSeed:"4",matchId:"show:main",
   order:1,eventImportance:72,intent:"EPIC" as const,
   plannedFinish:"CLEAN_PIN" as const,plannedLengthMinutes:22,
   injuryRateMultiplier:1,mediaReach:80,isMainEvent:true};
  const a=simulateMultiIndividualMatch(args);
  assert.deepEqual(a,simulateMultiIndividualMatch(args));
  assert.equal(a.members.length,count);
  assert.equal(a.members.filter(m=>m.won).length,1);
  assert.equal(a.actualWinnerSide,a.injuryStoppage?
   a.actualWinnerSide:layout.scriptedWinnerSide);
  assert.ok(a.members.every(m=>m.after.wear>=m.before.wear&&
   m.after.fatigue>=m.before.fatigue));
  const booking={family:"INDIVIDUAL" as const,
   participants:layout.participants.map(p=>p.personId),
   scriptedWinnerSide:layout.scriptedWinnerSide,plannedFinish:"CLEAN_PIN"};
  const resolution={actualWinnerSide:a.actualWinnerSide,
   actualFinish:a.actualFinish,...(a.medical?{medical:a.medical}:{})};
  assert.deepEqual(verifyMultiIndividualEvidence(booking,resolution),{
   actualWinnerSide:a.actualWinnerSide,actualFinish:a.actualFinish});
  const receipt={worldId:"world",promotionId:"promotion",showId:"show",
   year:1,week:1,resolutionId:"resolution",crowdResponse:70,
   matches:[{matchId:"main",position:0,crowdResponse:70,
    actualFinish:a.actualFinish,actualWinnerSide:a.actualWinnerSide}],segments:[]};
  assert.doesNotThrow(()=>validateCompletedMatchEvidence(receipt,
   [{matchId:"main",booking,resolution}]));
  assert.throws(()=>verifyMultiIndividualEvidence(booking,{
   actualWinnerSide:"A",actualFinish:"CLEAN_PIN"}),
   a.injuryStoppage?/medical|simulation/:/simulation/);
 }
});
test("reject mixed side groups, mismatched author outcomes and unsupported 5-person fields",()=>{
 const layout=make(4,"c");
 assert.throws(()=>readCanonicalMatchLayout({
  matchType:"SINGLES",family:"INDIVIDUAL",participants:layout.participants,
  sides:layout.sides,scriptedWinnerSide:"C",scriptedWinner:"b"}),/disagree/);
 assert.throws(()=>verifyMultiIndividualEvidence({
  family:"INDIVIDUAL",participants:["a","b","c"],
  scriptedWinnerSide:"D",plannedFinish:"CLEAN_PIN"},
  {actualWinnerSide:"D",actualFinish:"CLEAN_PIN"}),/Invalid/);
 const f=readCanonicalMatchLayout({
  matchType:"SINGLES",family:"INDIVIDUAL",
  participants:["a","b","c","d","e"].map(person),
  sides:["a","b","c","d","e"].map((id,i)=>({
   sideId:"ABCDE"[i],participants:[person(id)]})),
  scriptedWinnerSide:"E"});
 assert.throws(()=>requireSupportedScoringLayout(f),/awaits/);
});
