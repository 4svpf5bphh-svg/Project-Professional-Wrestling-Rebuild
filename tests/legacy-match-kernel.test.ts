import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {DeterministicRng,deterministicSeedFromText} from "../src/simulation/legacy/rng.js";
import {
  defaultMatchStyleForIntent,evaluateMatchStyleExecution,evaluateMatchStyleLoad,
  assessMatchStyleReadiness,normalizeMatchStyle,
} from "../src/simulation/legacy/match-style.js";
import {
  actualMatchFinish,plannedMatchFinish,resolveBookedFinishCheater,
  finishCheaterSide,setPlannedMatchFinish,setActualMatchFinish,
  isBookableMatchFinish,isRecordedMatchFinish,
} from "../src/simulation/legacy/match-finishes.js";
import {adaptBookedSinglesMatch,type WrestlerSimReadiness}
  from "../src/simulation/booked-match-adapter.js";

test("verbatim original PPW engine algorithms match archived source Git blobs",()=>{
  const files=[
    ["rng.ts","6ec774fc104a60e2b282f1ead0d9f66ecc6ad763"],
    ["match-style.ts","defff05dc1faf757ee2e1a12b436605f7eeae6fd"],
    ["match-finishes.ts","3d959f6a42e18ea384b01f5b9354d2c5cc8062b7"],
  ];
  for(const [filename,sha] of files){
    const path=new URL("../src/simulation/legacy/"+filename,import.meta.url);
    const local=readFileSync(path,"utf8");
    const archive=filename==="rng.ts"?local:local.replaceAll("./types.js","../../domain/src/types.js");
    const content=Buffer.from(archive,"utf8");
    const digest=createHash("sha1").update(Buffer.from("blob "+content.length+"\0"))
      .update(content).digest("hex");
    assert.equal(digest,sha,"Original PPW calculation changed unexpectedly: "+filename);
  }
});
test("reused deterministic World RNG reproduces identical sequences for the same seed",()=>{
  const seed=deterministicSeedFromText("world-42:show-12:style");
  const a=new DeterministicRng(seed),b=new DeterministicRng(seed);
  const first=Array.from({length:50},()=>a.next());
  assert.deepEqual(first,Array.from({length:50},()=>b.next()));
  assert.notDeepEqual(first,Array.from({length:50},()=>new DeterministicRng(seed+1).next()));
  assert.ok(first.every(v=>v>=0&&v<1));
});
test("the original finish semantics and winner/cheater roles survive the port",()=>{
  assert.equal(finishCheaterSide("DISQUALIFICATION","A"),"B");
  assert.equal(finishCheaterSide("FOREIGN_OBJECT","A"),"A");
  assert.equal(resolveBookedFinishCheater("DISQUALIFICATION","A",["winner"],["loser"]),"loser");
  assert.equal(resolveBookedFinishCheater("FOREIGN_OBJECT","A",["winner"],["loser"]),"winner");
  assert.throws(()=>resolveBookedFinishCheater("DISQUALIFICATION","A",
    ["winner"],["loser"],"winner"),/wrong match side/);
  assert.throws(()=>resolveBookedFinishCheater("DISQUALIFICATION","A",
    ["winner"],["loser","tagmate"]),/choose which wrestler cheats/);
  assert.equal(isRecordedMatchFinish("INJURY_STOPPAGE"),true);
  assert.equal(isBookableMatchFinish("INJURY_STOPPAGE"),false);
  const match:import("../src/simulation/legacy/types.js").Match={intent:"STORY"};
  assert.equal(plannedMatchFinish(match),"PROTECTED_FINISH");
  setPlannedMatchFinish(match,"CLEAN_PIN");
  assert.equal(plannedMatchFinish(match),"CLEAN_PIN");
  assert.equal(actualMatchFinish(match),null);
  setActualMatchFinish(match,"INJURY_STOPPAGE");
  assert.equal(actualMatchFinish(match),"INJURY_STOPPAGE");
});
test("original six-dimensional style, readiness and execution calculations are active",()=>{
  const protective=defaultMatchStyleForIntent("PROTECTIVE");
  const extreme=defaultMatchStyleForIntent("HIGH_RISK");
  assert.ok(evaluateMatchStyleLoad(extreme,30).physical>
    evaluateMatchStyleLoad(protective,15).physical);
  const strong={inRingQuality:95,matchCraft:90,presentation:86,stamina:94,safety:90};
  const weak={inRingQuality:35,matchCraft:25,presentation:40,stamina:32,safety:20};
  const expert=evaluateMatchStyleExecution(extreme,strong,30);
  const rookie=evaluateMatchStyleExecution(extreme,weak,30);
  assert.ok(expert.capability>rookie.capability);
  assert.ok(expert.difficultyPenalty<rookie.difficultyPenalty);
  const refusal=assessMatchStyleReadiness(extreme,weak,40,90,95);
  assert.equal(refusal.status,"REFUSES");
  assert.ok(refusal.reasons.includes("FATIGUE"));
  assert.throws(()=>normalizeMatchStyle({...extreme,risk:101}),/must be an integer/);
});
const strong:WrestlerSimReadiness={
  skills:{inRingQuality:88,matchCraft:81,presentation:75,stamina:86,safety:91},fatigue:9,wear:4,
};
const fatigued:WrestlerSimReadiness={
  skills:{inRingQuality:76,matchCraft:78,presentation:70,stamina:77,safety:74},fatigue:98,wear:80,
};
const people=new Map([["a",strong],["b",strong]]);
const payload={
  participants:[{personId:"a",contractId:"ca"},{personId:"b",contractId:"cb"}],
  scriptedWinner:"b",matchType:"SINGLES",intent:"TECHNICAL",
  plannedLengthMinutes:20,plannedFinish:"SUBMISSION",
};
test("adapter accepts new booked singles format without changing player-authored finish",()=>{
  const copy=JSON.stringify(payload);
  const projected=adaptBookedSinglesMatch(payload,people);
  assert.equal(projected.winnerId,"b");
  assert.equal(projected.plannedFinish,"SUBMISSION");
  assert.equal(projected.style.technical,92);
  assert.equal(projected.status,"READY");
  assert.deepEqual(projected.personIds,["a","b"]);
  assert.deepEqual(projected.contractIds,["ca","cb"]);
  assert.equal(projected.styleEvaluations.length,2);
  assert.equal(JSON.stringify(payload),copy);
});
test("original cheater rules apply through the new card adapter",()=>{
  const result=adaptBookedSinglesMatch({...payload,scriptedWinner:"a",
    intent:"STORY",plannedFinish:"DISQUALIFICATION",cheatingWrestlerId:"b"},people);
  assert.equal(result.winnerId,"a");
  assert.equal(result.plannedFinish,"DISQUALIFICATION");
  assert.equal(result.finishCheaterId,"b");
  assert.throws(()=>adaptBookedSinglesMatch({...payload,scriptedWinner:"a",
    plannedFinish:"DISQUALIFICATION",cheatingWrestlerId:"a"},people),/wrong match side/);
});
test("new match adapter refuses to invent a winner or accept unsupported booking",()=>{
  assert.throws(()=>adaptBookedSinglesMatch({...payload,scriptedWinner:undefined},people),
    /scripted winner required/);
  assert.throws(()=>adaptBookedSinglesMatch({...payload,scriptedWinner:"x"},people),
    /scripted winner required/);
  assert.throws(()=>adaptBookedSinglesMatch({...payload,matchType:"TAG"},people),
    /requires two distinct singles/);
  assert.throws(()=>adaptBookedSinglesMatch({...payload,plannedFinish:"INJURY_STOPPAGE"},people),
    /Only original bookable finishes/);
  assert.throws(()=>adaptBookedSinglesMatch({...payload,intent:"ALIEN"},people),
    /Unknown legacy match intent/);
  assert.throws(()=>adaptBookedSinglesMatch({...payload,plannedLengthMinutes:200},people),
    /Invalid match length/);
  assert.throws(()=>adaptBookedSinglesMatch(payload,new Map([["a",strong]])),
    /Missing wrestler skills/);
  assert.throws(()=>adaptBookedSinglesMatch(payload,new Map([["a",strong],["b",{
    ...strong,skills:{...strong.skills,stamina:Number.NaN},
  }]])),/Invalid wrestler skill/);
});
test("fatigue triggers wrestling style review, never rewrites scripted winner",()=>{
  const result=adaptBookedSinglesMatch(payload,new Map([["a",strong],["b",fatigued]]));
  assert.equal(result.status,"NEEDS_STYLE_REVIEW");
  assert.equal(result.winnerId,"b");
  assert.equal(result.plannedFinish,"SUBMISSION");
});
