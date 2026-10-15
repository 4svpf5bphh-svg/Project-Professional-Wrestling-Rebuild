import assert from "node:assert/strict";
import test from "node:test";
import {DeterministicRng,deterministicSeedFromText}
  from "../src/simulation/legacy/rng.js";
import {previewArchivedInjuryStoppage,type InjuryResolutionInput}
  from "../src/simulation/legacy/match-injuries.js";
import {scoreArchivedSinglesBeforeInjuries} from "../src/simulation/legacy/match-scoring.js";
const injured={
  skills:{inRingQuality:75,matchCraft:66,presentation:68,stamina:50,safety:25},
  popularity:58,recognition:64,momentum:61,fatigue:88,wear:70,
};
const safe={
  skills:{inRingQuality:78,matchCraft:75,presentation:73,stamina:82,safety:80},
  popularity:73,recognition:76,momentum:69,fatigue:6,wear:5,
};
const base:InjuryResolutionInput={
  worldSeed:42,matchId:"show:one",order:1,eventImportance:70,
  intent:"HIGH_RISK",style:null,plannedFinish:"CLEAN_PIN",
  plannedLengthMinutes:40,chemistryModifier:1,
  people:[injured,safe],personIds:["injured","opponent"],
  bookedWinnerId:"injured",injuryRateMultiplier:10,
};
function findOutcome(check:(value:ReturnType<typeof previewArchivedInjuryStoppage>)=>boolean){
  for(let i=0;i<10000;i++){
    const value=previewArchivedInjuryStoppage({...base,matchId:"stress:"+i});
    if(check(value))return value;
  }
  throw new Error("Seeded injury search failed");
}
test("archived scorer and injury resolver share identical pre-injury scoring outputs",()=>{
  const first=previewArchivedInjuryStoppage(base);
  const second=previewArchivedInjuryStoppage({...base});
  assert.deepEqual(first,second);
  assert.deepEqual(first.preInjury,scoreArchivedSinglesBeforeInjuries(base));
  assert.equal(first.stage,"POST_INJURY_PRE_INTERFERENCE_PRE_SHOW_FLOW");
  assert.equal(first.plannedWinnerId,"injured");
  assert.equal(first.plannedFinish,"CLEAN_PIN");
  assert.equal(first.actualWinnerId,first.injuryStoppage?"opponent":"injured");
});
test("serious injury to scripted winner forces legitimate referee stoppage and opponent wins",()=>{
  const stopped=findOutcome(r=>r.injuryStoppage);
  assert.ok(stopped.injuries.some(i=>i.personId==="injured"&&
    (i.severity==="MAJOR"||i.severity==="SEVERE")));
  assert.equal(stopped.actualWinnerId,"opponent");
  assert.equal(stopped.actualFinish,"INJURY_STOPPAGE");
  assert.equal(stopped.crowdResponse,
    Math.round(Math.max(0,stopped.preInjury.crowdResponse-4)*10)/10);
  assert.equal(stopped.plannedWinnerId,"injured");
  assert.equal(stopped.plannedFinish,"CLEAN_PIN");
  assert.ok(stopped.injuries.every(i=>i.weeksOut>=1&&i.weeksOut<=18));
});
test("injury to loser, or manageable minor/moderate injury, preserves scripted finish",()=>{
  const loserInjury=findOutcome(r=>r.injuries.some(i=>i.personId==="opponent") &&
    !r.injuryStoppage);
  assert.equal(loserInjury.actualWinnerId,"injured");
  assert.equal(loserInjury.actualFinish,"CLEAN_PIN");
  assert.equal(loserInjury.crowdResponse,loserInjury.preInjury.crowdResponse);
  const manageable=findOutcome(r=>r.injuries.some(i=>i.personId==="injured"&&
    (i.severity==="MINOR"||i.severity==="MODERATE"))&&!r.injuryStoppage);
  assert.equal(manageable.actualWinnerId,"injured");
  assert.equal(manageable.actualFinish,"CLEAN_PIN");
});
test("injury chance and severity consume original RNG stream after exactly 3 scoring draws",()=>{
  const matchId="stress:31";
  const result=previewArchivedInjuryStoppage({...base,matchId});
  const rng=new DeterministicRng(deterministicSeedFromText(
    `${base.worldSeed}:${matchId}:resolve`));
  // Original scoring draws: execution noise, crowd noise, actual duration.
  rng.float(-7,7);rng.float(-6,6);rng.float(0.88,1.1);
  const averageSafety=(injured.skills.safety+safe.skills.safety)/2;
  const expected=[];
  for(const [personId,person] of [["injured",injured],["opponent",safe]] as const){
    const risk=Math.min(0.035,Math.max(0.0002,(0.0007+0.006+
      person.fatigue/18000+person.wear/22000+
      Math.max(0,70-averageSafety)/9000+
      Math.max(0,base.plannedLengthMinutes-15)/12000)*base.injuryRateMultiplier));
    if(!rng.chance(risk))continue;
    const roll=rng.next();
    const severity=roll<0.56?"MINOR":roll<0.86?"MODERATE":roll<0.97?"MAJOR":"SEVERE";
    const weeksOut=severity==="MINOR"?rng.int(1,2):
      severity==="MODERATE"?rng.int(2,5):
      severity==="MAJOR"?rng.int(5,10):rng.int(10,18);
    expected.push({personId,severity,weeksOut,probability:risk});
  }
  assert.deepEqual(result.injuries,expected);
});
test("style-specific injury risk uses original risk/intensity/physical-load formula",()=>{
  const result=previewArchivedInjuryStoppage({...base,style:{
    competitiveness:75,technical:40,story:55,intensity:96,risk:98,epic:78,
  }});
  assert.equal(result.preInjury.styleResolver,"DIMENSIONAL");
  assert.ok(result.injuries.every(i=>i.probability>=0.0002&&i.probability<=0.035));
});
test("unsafe, unbooked and fabricated medical inputs fail closed",()=>{
  assert.throws(()=>previewArchivedInjuryStoppage({...base,bookedWinnerId:"referee"}),
    /Invalid booked winner/);
  assert.throws(()=>previewArchivedInjuryStoppage({...base,
    personIds:["injured","injured"]}),/Invalid booked winner/);
  assert.throws(()=>previewArchivedInjuryStoppage({...base,injuryRateMultiplier:-1}),
    /Invalid booked winner/);
  assert.throws(()=>previewArchivedInjuryStoppage({...base,injuryRateMultiplier:Infinity}),
    /Invalid booked winner/);
  assert.throws(()=>previewArchivedInjuryStoppage({...base,
    people:[{...injured,wear:NaN},safe]}),/Unknown or invalid/);
});
