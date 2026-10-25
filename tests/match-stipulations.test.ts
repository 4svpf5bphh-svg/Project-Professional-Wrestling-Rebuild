import test from "node:test";
import assert from "node:assert/strict";
import {normalizeBookableMatch} from "../src/domain/bookable-match.js";
import {compatibleStipulations,permittedStipulationFinishes,
 readMatchStipulation,stipulationScoringFinish,stipulationInjuryRisk,
 isSpecialStipulationFinish} from "../src/domain/match-stipulations.js";
import {verifyResolvedSinglesEvidence}
 from "../src/domain/verified-match-evidence.js";
import {describeMatchFinish} from "../src/domain/show-match-story.js";
import {replayVerifiedMatchFinish} from "../src/domain/show-finish-replay.js";

const people=[{personId:"alpha",contractId:"contract-a"},
 {personId:"bravo",contractId:"contract-b"}];
const singles={
 matchType:"SINGLES",family:"INDIVIDUAL",
 sides:[{sideId:"A",participants:[people[0]]},
  {sideId:"B",participants:[people[1]]}],
 participants:people,scriptedWinnerSide:"A",scriptedWinner:"alpha",
 plannedLengthMinutes:20,intent:"COMPETITIVE"
};
test("all stipulated match families reject incompatible formats and preserve old rules",()=>{
 assert.equal(compatibleStipulations("SINGLES").length,8);
 assert.deepEqual(compatibleStipulations("BATTLE_ROYAL"),["STANDARD"]);
 assert.deepEqual(compatibleStipulations("MULTI_TEAM"),["STANDARD"]);
 assert.equal(compatibleStipulations("TAG").includes("LAST_MAN_STANDING"),false);
 assert.equal(compatibleStipulations("TRIPLE_THREAT").includes("HARDCORE"),true);
 assert.throws(()=>readMatchStipulation("TLC","BATTLE_ROYAL"),/not permitted/);
 assert.ok(stipulationInjuryRisk("TLC")>stipulationInjuryRisk("STANDARD"));
 const original=normalizeBookableMatch(singles);
 assert.equal(original.plannedFinish,"CLEAN_PIN");
 assert.equal(original.stipulation,undefined);
 assert.equal(original.scriptedWinner,"alpha");
});
test("seven stipulations save only allowed winning methods without overriding authored winners",()=>{
 const fixtures=[
  ["LADDER","RETRIEVAL"],["TABLES","TABLE_BREAK"],["TLC","RETRIEVAL"],
  ["LAST_MAN_STANDING","TEN_COUNT"],["SUBMISSION","SUBMISSION"],
  ["STEEL_CAGE","CLEAN_PIN"],["HARDCORE","CLEAN_PIN"]
 ] as const;
 for(const [stipulation,finish] of fixtures){
  const saved=normalizeBookableMatch({...singles,stipulation,plannedFinish:finish});
  assert.equal(saved.stipulation,stipulation);
  assert.equal(saved.scriptedWinner,"alpha");
  assert.equal(saved.scriptedWinnerSide,"A");
  assert.equal(saved.plannedFinish,finish);
  assert.ok(permittedStipulationFinishes(stipulation,"SINGLES").includes(finish));
  const verification=verifyResolvedSinglesEvidence({
   participants:["alpha","bravo"],scriptedWinner:"alpha",plannedFinish:finish
  },{actualWinner:"alpha",actualFinish:finish});
  assert.equal(verification.actualWinnerSide,"A");
  assert.equal(verification.actualFinish,finish);
 }
 for(const stipulation of ["LADDER","TABLES","TLC",
  "LAST_MAN_STANDING","SUBMISSION"] as const){
  assert.throws(()=>normalizeBookableMatch({...singles,stipulation,
   plannedFinish:"CLEAN_PIN"}),/finish is not legal/);
 }
 assert.throws(()=>normalizeBookableMatch({...singles,stipulation:"HARDCORE",
  plannedFinish:"DISQUALIFICATION"}),/finish is not legal/);
 assert.throws(()=>normalizeBookableMatch({...singles,stipulation:"STEEL_CAGE",
  interference:{personId:"outside"}}),/outside run-in/);
 assert.throws(()=>normalizeBookableMatch({...singles,stipulation:"LADDER",
  scriptedWinnerSide:"Z"}),/booked side|outcome/i);
});
test("special finishes are proxies for scoring but authoritative for evidence and replay",()=>{
 for(const finish of ["RETRIEVAL","TABLE_BREAK","TEN_COUNT"]){
  assert.equal(isSpecialStipulationFinish(finish),true);
  assert.equal(stipulationScoringFinish(finish),"CLEAN_PIN");
  const copy=describeMatchFinish({actualFinish:finish,actualWinnerSide:"A",
   winnerNames:["Alpha"],participants:["Alpha","Bravo"]});
  assert.match(copy.summary,/winner|opponent|climb/i);
  const replay=replayVerifiedMatchFinish({type:"MATCH",outcome:finish,
   matchContext:{winnerNames:["Alpha"]}} as Parameters<typeof replayVerifiedMatchFinish>[0]);
  assert.ok(replay?.title);
  assert.equal(replay?.winnerLabel,"Alpha");
  assert.doesNotMatch(replay?.description??"",/three-count won/i);
 }
 // An unverified scorer cannot swap a scripted winner or invent a finish.
 assert.throws(()=>verifyResolvedSinglesEvidence({
  participants:["alpha","bravo"],scriptedWinner:"alpha",plannedFinish:"TABLE_BREAK"
 },{actualWinner:"bravo",actualFinish:"TABLE_BREAK"}),/cannot change scripted winner/);
 assert.throws(()=>verifyResolvedSinglesEvidence({
  participants:["alpha","bravo"],scriptedWinner:"alpha",plannedFinish:"RETRIEVAL"
 },{actualWinner:"alpha",actualFinish:"CLEAN_PIN"}),/not supported/);
});
