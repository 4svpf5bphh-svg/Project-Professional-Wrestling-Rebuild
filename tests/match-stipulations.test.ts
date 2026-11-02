import test from "node:test";
import assert from "node:assert/strict";
import {normalizeBookableMatch} from "../src/domain/bookable-match.js";
import {compatibleStipulations,permittedStipulationFinishes,
 readMatchStipulation,stipulationScoringFinish,stipulationInjuryRisk,
 stipulationExecutionFit,stipulationMinimumMinutes,
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
 assert.equal(compatibleStipulations("SINGLES").length,15);
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

test("expanded gimmick matches have actual distinct winning conditions and length rules",()=>{
 const sample=[
  ["IRON_MAN","MOST_FALLS",30,"SINGLES"],
  ["TWO_OUT_OF_THREE","SECOND_FALL",15,"TAG"],
  ["FALLS_COUNT_ANYWHERE","CLEAN_PIN",3,"FOUR_WAY"],
  ["I_QUIT","VERBAL_SURRENDER",10,"SINGLES"],
  ["FIRST_BLOOD","FIRST_BLOOD",3,"SINGLES"],
  ["BACKSTAGE_BRAWL","CLEAN_PIN",3,"TAG"],
  ["CASKET","CASKET_CLOSE",3,"SINGLES"]
 ] as const;
 for(const [stip,finish,min,format] of sample){
  assert.ok(compatibleStipulations(format).includes(stip));
  assert.equal(stipulationMinimumMinutes(stip),min);
  const booked=normalizeBookableMatch({...singles,stipulation:stip,
   plannedLengthMinutes:Math.max(min,20),plannedFinish:finish});
  assert.equal(booked.plannedFinish,finish);
  assert.equal(booked.stipulation,stip);
  assert.equal(booked.scriptedWinner,"alpha");
 }
 assert.throws(()=>normalizeBookableMatch({...singles,stipulation:"IRON_MAN",
  plannedLengthMinutes:20,plannedFinish:"MOST_FALLS"}),/at least 30/);
 assert.throws(()=>normalizeBookableMatch({...singles,stipulation:"TWO_OUT_OF_THREE",
  plannedLengthMinutes:10,plannedFinish:"SECOND_FALL"}),/at least 15/);
 assert.throws(()=>normalizeBookableMatch({...singles,stipulation:"I_QUIT",
  plannedFinish:"CLEAN_PIN"}),/finish is not legal/);
 for(const finish of ["MOST_FALLS","SECOND_FALL","FIRST_BLOOD"])
  assert.equal(stipulationScoringFinish(finish),"CLEAN_PIN");
 assert.equal(stipulationScoringFinish("VERBAL_SURRENDER"),"SUBMISSION");
 assert.ok(stipulationInjuryRisk("BACKSTAGE_BRAWL")>
  stipulationInjuryRisk("TWO_OUT_OF_THREE"));
 assert.equal(readMatchStipulation("IRON_MAN","SINGLES"),"IRON_MAN");
 assert.throws(()=>readMatchStipulation("FIRST_BLOOD","TRIPLE_THREAT"),/not permitted/);
});
test("gimmick upside is skill-dependent, not an unconditional star bonus",()=>{
 const profile={inRing:86,craft:85,presentation:81,stamina:88,safety:88,
  fatigue:8,length:35,intent:"TECHNICAL"};
 const strong=stipulationExecutionFit("IRON_MAN",profile);
 const weak=stipulationExecutionFit("IRON_MAN",{
  ...profile,inRing:29,craft:27,stamina:31,fatigue:85});
 assert.ok(strong>0);
 assert.ok(weak<0);
 assert.ok(strong>weak);
 assert.equal(stipulationExecutionFit("STANDARD",profile),0);
 assert.ok(stipulationExecutionFit("LADDER",profile)<=5);
 assert.ok(stipulationExecutionFit("TLC",{...profile,stamina:35,fatigue:95})<strong);
});
