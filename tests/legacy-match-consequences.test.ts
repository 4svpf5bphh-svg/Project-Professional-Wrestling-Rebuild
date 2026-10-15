import assert from "node:assert/strict";
import test from "node:test";
import {previewArchivedInjuryStoppage,type InjuryResolutionInput}
  from "../src/simulation/legacy/match-injuries.js";
import {previewArchivedInterference} from "../src/simulation/legacy/match-interference.js";
import {previewArchivedMatchConsequences} from "../src/simulation/legacy/match-consequences.js";

const a={skills:{inRingQuality:80,matchCraft:76,presentation:70,stamina:60,safety:65},
  popularity:60,recognition:62,momentum:53,fatigue:25,wear:32};
const b={skills:{inRingQuality:82,matchCraft:82,presentation:76,stamina:78,safety:86},
  popularity:63,recognition:70,momentum:60,fatigue:8,wear:6};
const base:InjuryResolutionInput={
  worldSeed:471,matchId:"opening",order:1,eventImportance:67,
  intent:"EPIC",style:null,plannedFinish:"CLEAN_PIN",
  plannedLengthMinutes:28,chemistryModifier:2,
  people:[a,b],personIds:["a","b"],bookedWinnerId:"a",injuryRateMultiplier:0,
};
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const r1=(v:number)=>Math.round(v*10)/10;
const r2=(v:number)=>Math.round(v*100)/100;
const evaluate=(input:InjuryResolutionInput=base,mediaReach=68,isMainEvent=true)=>{
  const injury=previewArchivedInjuryStoppage(input);
  const final=previewArchivedInterference(injury,null,null);
  return previewArchivedMatchConsequences({booked:input,injury,final,mediaReach,isMainEvent});
};
test("archived athlete load, finish momentum and exposure arithmetic matches original formulas",()=>{
  const result=evaluate();
  const duration=previewArchivedInjuryStoppage(base).preInjury.actualLengthMinutes;
  const loadBase=duration*0.62; // EPIC original intent-only match branch
  const byId=[a,b];
  for(let i=0;i<2;i++){
    const before=byId[i]!,expected=result.performers[i]!;
    const won=i===0;
    const nextFatigue=r1(clamp(before.fatigue+
      loadBase*(1.15-before.skills.stamina/220),0,100));
    const nextWear=r1(clamp(before.wear+duration*0.012*
      (1.15-before.skills.safety/260),0,100));
    const momentumDelta=won?1.4:
      (previewArchivedInjuryStoppage(base).preInjury.criticalRatingStars>=4?0.35:-0.45);
    const nextMomentum=r1(clamp(before.momentum+momentumDelta,0,100));
    const exposureBase=0.025+68/3000+67/5000+0.015;
    const nextRecognition=r2(clamp(before.recognition+
      exposureBase*Math.max(0.08,1-before.recognition/108),0,100));
    const score=previewArchivedInjuryStoppage(base).preInjury;
    const crowd=previewArchivedInterference(previewArchivedInjuryStoppage(base),null,null).crowdResponse;
    const crowdGain=Math.max(0,crowd-55)/800;
    const performanceGain=Math.max(0,score.criticalRatingStars-2.5)*0.035;
    const resultGain=won?0.012:0;
    const poorPenalty=score.criticalRatingStars<1.75?0.02:crowd<32?0.01:0;
    const headroom=Math.max(0.12,1-before.popularity/108);
    const nextPopularity=r2(clamp(before.popularity+
      (crowdGain+performanceGain+resultGain)*headroom-poorPenalty,0,100));
    assert.deepEqual(expected.after,{
      fatigue:nextFatigue,wear:nextWear,momentum:nextMomentum,
      recognition:nextRecognition,popularity:nextPopularity,
    });
    assert.equal(expected.won,won);
  }
});
test("media reach and main-event exposure increase recognition, without fabricating roster advantages",()=>{
  const small=evaluate(base,0,false),big=evaluate(base,200,true);
  assert.ok(big.performers[0]!.after.recognition>small.performers[0]!.after.recognition);
  assert.equal(big.actualWinnerId,small.actualWinnerId);
  assert.equal(big.performers[0]!.after.fatigue,small.performers[0]!.after.fatigue);
  assert.deepEqual(evaluate(),evaluate());
});
test("interference finish influences momentum but never rerolls the winner",()=>{
  const injury=previewArchivedInjuryStoppage(base);
  const scripted=previewArchivedInterference(injury,{personId:"third",
    aidedSide:"A",plannedOutcome:"SUCCESS"},{active:true,appearanceCommitted:true,presentation:80});
  const changed=previewArchivedMatchConsequences({
    booked:base,injury,final:scripted,mediaReach:60,isMainEvent:false,
  });
  assert.equal(changed.actualWinnerId,"a");
  assert.equal(changed.actualFinish,"PROTECTED_FINISH");
  assert.equal(changed.performers[0]!.after.momentum,r1(a.momentum+0.7));
});
test("real severe winner injury applies original recovery floor and opponent win",()=>{
  let found:InjuryResolutionInput|null=null;
  for(let i=0;i<12000;i++){
    const x:InjuryResolutionInput={...base,matchId:"medical-"+i,
      intent:"HIGH_RISK",plannedLengthMinutes:40,injuryRateMultiplier:10,
      people:[{...a,fatigue:90,wear:89,skills:{...a.skills,safety:10}},b],
    };
    if(previewArchivedInjuryStoppage(x).injuryStoppage){found=x;break;}
  }
  assert.ok(found);
  const injury=previewArchivedInjuryStoppage(found!);
  const final=previewArchivedInterference(injury,null,null);
  const result=previewArchivedMatchConsequences({
    booked:found!,injury,final,mediaReach:40,isMainEvent:true,
  });
  assert.equal(result.actualWinnerId,"b");
  assert.equal(result.actualFinish,"INJURY_STOPPAGE");
  const injured=result.performers[0]!;
  assert.ok(injured.injury);
  const severity=injured.injury!.severity;
  assert.ok(severity==="MAJOR"||severity==="SEVERE");
  assert.ok(injured.after.fatigue>= (severity==="SEVERE"?80:65));
  assert.equal(result.performers[1]!.after.momentum,r1(b.momentum+0.35));
  assert.equal(injured.after.momentum,r1(found!.people[0]!.momentum-0.05));
});
test("incomplete canonical inputs and mismatched outcome phases are refused",()=>{
  const injury=previewArchivedInjuryStoppage(base);
  const final=previewArchivedInterference(injury,null,null);
  assert.throws(()=>previewArchivedMatchConsequences({
    booked:base,injury,final,mediaReach:NaN,isMainEvent:false,
  }),/Missing or invalid canonical media reach/);
  assert.throws(()=>previewArchivedMatchConsequences({
    booked:{...base,bookedWinnerId:"b"},injury,final,mediaReach:68,isMainEvent:true,
  }),/Mismatch between booked/);
  assert.throws(()=>previewArchivedMatchConsequences({
    booked:base,injury,final:{...final,actualWinnerId:"b"},
    mediaReach:68,isMainEvent:true,
  }),/Mismatch between booked/);
});
