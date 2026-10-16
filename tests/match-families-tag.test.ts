import assert from "node:assert/strict";
import test from "node:test";
import {readCanonicalMatchLayout,requireSupportedScoringLayout}
 from "../src/domain/match-sides.js";
import {simulateBookedTagMatch} from "../src/simulation/tag-match-simulation.js";
import {verifyResolvedTeamEvidence}
 from "../src/domain/verified-team-evidence.js";
import {validateCompletedMatchEvidence}
 from "../src/domain/completed-match-evidence.js";
import type {ScoredWrestler} from "../src/simulation/legacy/match-scoring.js";
const person=(name:string)=>({personId:name,contractId:"deal-"+name});
const p={matchType:"TAG",family:"TEAMS",participants:["a","b","c","d"].map(person),
 sides:[{sideId:"A",participants:["a","b"].map(person)},
  {sideId:"B",participants:["c","d"].map(person)}],
 scriptedWinnerSide:"B",intent:"COMPETITIVE",
 plannedFinish:"CLEAN_PIN",plannedLengthMinutes:19};
const w:ScoredWrestler={skills:{inRingQuality:80,matchCraft:83,presentation:84,stamina:90,safety:92},
 popularity:70,recognition:75,momentum:68,fatigue:12,wear:10};
const talent=new Map(["a","b","c","d"].map((id,i)=>[id,
 {...w,momentum:w.momentum+i}] as const));
const args={layout:readCanonicalMatchLayout(p),wrestlers:talent,worldSeed:"9",
 matchId:"tag-show:match-1",order:1,eventImportance:77,
 intent:"COMPETITIVE" as const,plannedFinish:"CLEAN_PIN" as const,
 plannedLengthMinutes:19,chemistryModifier:4.5,injuryRateMultiplier:1,
 mediaReach:75,isMainEvent:true};
test("individual legacy booking upgrades losslessly and 2v2 uses real side contract",()=>{
 const legacy=readCanonicalMatchLayout({participants:[person("a"),person("b")],
  scriptedWinner:"b",matchType:"SINGLES"});
 assert.equal(legacy.family,"INDIVIDUAL");
 assert.equal(legacy.scriptedWinnerSide,"B");
 assert.equal(requireSupportedScoringLayout(legacy),"SINGLES");
 const match=readCanonicalMatchLayout(p);
 assert.equal(requireSupportedScoringLayout(match),"TAG");
 assert.deepEqual(match.sides.map(x=>x.participants.map(p=>p.personId)),
  [["a","b"],["c","d"]]);
 assert.throws(()=>readCanonicalMatchLayout({...p,
  sides:[p.sides[0],{sideId:"B",participants:[person("c"),person("a")]}]}),/disagree|repeated/);
 assert.throws(()=>readCanonicalMatchLayout({...p,
  scriptedWinnerSide:"C"}),/outcome/);
 assert.throws(()=>readCanonicalMatchLayout({...p,participants:p.participants.slice(0,3)}),/disagree/);
 assert.throws(()=>readCanonicalMatchLayout({...p,
  sides:[{sideId:"A",participants:[person("a")]},p.sides[1]]}),/disagree|evenly/);
 const triple=readCanonicalMatchLayout({
  matchType:"SINGLES",family:"INDIVIDUAL",
  participants:["a","b","c"].map(person),
  sides:["a","b","c"].map((id,i)=>({sideId:"ABC"[i],participants:[person(id)]})),
  scriptedWinnerSide:"C"});
 assert.throws(()=>requireSupportedScoringLayout(triple),/awaits/);
});
test("scripted 2v2 results, team chemistry and all four medical exposures are deterministic",()=>{
 const a=simulateBookedTagMatch(args),b=simulateBookedTagMatch(args);
 assert.deepEqual(a,b);
 assert.equal(a.plannedWinnerSide,"B");
 assert.equal(a.members.length,4);
 assert.deepEqual(a.members.map(x=>x.personId),["a","b","c","d"]);
 assert.ok(a.members.every(x=>x.after.fatigue>12&&x.after.wear>10));
 assert.ok(a.score.criticalRatingStars>=.5);
 assert.ok(a.final.crowdResponse>=0&&a.final.crowdResponse<=100);
 assert.equal(a.actualWinnerSide,a.injury.injuryStoppage?"A":"B");
 assert.equal(a.members.filter(x=>x.won).length,2);
 assert.throws(()=>simulateBookedTagMatch({...args,
  layout:readCanonicalMatchLayout({participants:[person("a"),person("b")],
    scriptedWinner:"a"})}),/only supports/);
});
test("team evidence refuses overturned scripted finishes except verified severe medical stoppages",()=>{
 const booking={family:"TEAMS" as const,
  sides:[{sideId:"A" as const,participants:["a","b"]},
   {sideId:"B" as const,participants:["c","d"]}],
  scriptedWinnerSide:"B" as const,plannedFinish:"CLEAN_PIN"};
 const winner={actualWinnerSide:"B" as const,actualFinish:"CLEAN_PIN"};
 assert.deepEqual(verifyResolvedTeamEvidence(booking,winner),
  {actualWinnerSide:"B",actualFinish:"CLEAN_PIN"});
 assert.throws(()=>verifyResolvedTeamEvidence(booking,{
  actualWinnerSide:"A",actualFinish:"CLEAN_PIN"}),/scripted winning team/);
 assert.deepEqual(verifyResolvedTeamEvidence(booking,{
  actualWinnerSide:"A",actualFinish:"INJURY_STOPPAGE",
  medical:{injuredPersonId:"c",severity:"MAJOR",stoppage:true}}),
  {actualWinnerSide:"A",actualFinish:"INJURY_STOPPAGE"});
 assert.throws(()=>verifyResolvedTeamEvidence(booking,{
  actualWinnerSide:"A",actualFinish:"INJURY_STOPPAGE",
  medical:{injuredPersonId:"a",severity:"MAJOR",stoppage:true}}),/scripted winning team/);
 const evidence={matchId:"m1",booking,resolution:winner};
 const receipt={worldId:"world",promotionId:"promotion",showId:"show",
  year:1,week:1,resolutionId:"resolution",crowdResponse:70,
  matches:[{matchId:"m1",position:0,crowdResponse:70,actualFinish:"CLEAN_PIN",
   actualWinnerSide:"B" as const}],segments:[]};
 assert.doesNotThrow(()=>validateCompletedMatchEvidence(receipt,[evidence]));
 assert.throws(()=>validateCompletedMatchEvidence({...receipt,
  matches:[{...receipt.matches[0]!,actualWinnerSide:"A" as const}]},[evidence]),
 /contradicts/);
});
