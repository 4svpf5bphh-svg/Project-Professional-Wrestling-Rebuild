import assert from "node:assert/strict";
import test from "node:test";
import {previewArchivedInjuryStoppage,type InjuryResolutionInput}
  from "../src/simulation/legacy/match-injuries.js";
import {readBookedInterference,previewArchivedInterference,
  type BookedInterference} from "../src/simulation/legacy/match-interference.js";

const performers=[
  {skills:{inRingQuality:70,matchCraft:70,presentation:70,stamina:70,safety:70},
    popularity:70,recognition:70,momentum:70,fatigue:12,wear:10},
  {skills:{inRingQuality:75,matchCraft:75,presentation:75,stamina:75,safety:75},
    popularity:75,recognition:75,momentum:75,fatigue:10,wear:5},
] as const;
const input:InjuryResolutionInput={
  worldSeed:33,matchId:"single",order:1,eventImportance:60,
  intent:"STORY",style:null,plannedFinish:"CLEAN_PIN",
  plannedLengthMinutes:15,chemistryModifier:2,people:[...performers],
  personIds:["a","b"],bookedWinnerId:"a",injuryRateMultiplier:0,
};
const booked:BookedInterference={personId:"c",aidedSide:"A",plannedOutcome:"SUCCESS"};
const available={active:true,appearanceCommitted:true,presentation:90};
const round=(n:number)=>Math.round(Math.max(0,Math.min(100,n))*10)/10;
test("a scripted successful interference changes the finish, never the winner",()=>{
  const injury=previewArchivedInjuryStoppage(input);
  assert.equal(injury.injuryStoppage,false);
  const actual=previewArchivedInterference(injury,booked,available);
  assert.equal(actual.actualWinnerId,"a");
  assert.equal(actual.actualFinish,"PROTECTED_FINISH");
  assert.equal(actual.interference?.outcome,"SUCCESS");
  assert.ok(Math.abs(actual.interference!.delivery-1.8)<1e-12);
  assert.equal(actual.crowdResponse,round(injury.crowdResponse+1.5+1.8));
  assert.deepEqual(actual,previewArchivedInterference(injury,booked,available));
});
test("THWARTED is player-authored, not a stochastic success/failure roll",()=>{
  const injury=previewArchivedInjuryStoppage(input);
  const actual=previewArchivedInterference(injury,
    {...booked,plannedOutcome:"THWARTED"},available);
  assert.equal(actual.interference?.outcome,"THWARTED");
  assert.equal(actual.actualFinish,"CLEAN_PIN");
  assert.equal(actual.actualWinnerId,"a");
  assert.equal(actual.crowdResponse,round(injury.crowdResponse-0.5+1.8));
});
test("unbooked, missing or inactive interferer aborts the spot, even if booked SUCCESS",()=>{
  const injury=previewArchivedInjuryStoppage(input);
  for(const absent of [null,{...available,appearanceCommitted:false},
    {...available,active:false}]){
    const result=previewArchivedInterference(injury,booked,absent);
    assert.equal(result.interference?.outcome,"ABORTED");
    assert.equal(result.interference?.abortReason,"INTERFERER_UNAVAILABLE");
    assert.equal(result.actualFinish,injury.actualFinish);
    assert.equal(result.actualWinnerId,injury.actualWinnerId);
    assert.equal(result.crowdResponse,round(injury.crowdResponse-2));
  }
});
test("medical referee stoppage prevents even a fully booked successful run-in",()=>{
  // Search only the pure seeded original RNG; no probabilistic/flaky assertion.
  let medical:ReturnType<typeof previewArchivedInjuryStoppage>|null=null;
  for(let i=0;i<20000;i++){
    const trial=previewArchivedInjuryStoppage({
      ...input,matchId:"medical-"+i,injuryRateMultiplier:10,
      intent:"HIGH_RISK",plannedLengthMinutes:40,
      people:[{...performers[0],fatigue:99,wear:99,
        skills:{...performers[0].skills,safety:10}},performers[1]],
    });
    if(trial.injuryStoppage){medical=trial;break;}
  }
  assert.ok(medical);
  const stopped=previewArchivedInterference(medical!,booked,available);
  assert.equal(stopped.injuryStoppage,true);
  assert.equal(stopped.actualWinnerId,"b");
  assert.equal(stopped.actualFinish,"INJURY_STOPPAGE");
  assert.equal(stopped.interference?.outcome,"ABORTED");
  assert.equal(stopped.interference?.abortReason,"INJURY_STOPPAGE");
  assert.equal(stopped.crowdResponse,round(medical!.crowdResponse-2));
});
test("no interference is not a random spot, and booking contract is typed",()=>{
  const injury=previewArchivedInjuryStoppage(input);
  assert.equal(previewArchivedInterference(injury,null,null).interference,null);
  assert.deepEqual(readBookedInterference({
    interference:{personId:"c",aidedSide:"A",plannedOutcome:"SUCCESS"},
  }),booked);
  assert.equal(readBookedInterference({participants:[]}),null);
  for(const bad of [
    {interference:{personId:"",aidedSide:"A",plannedOutcome:"SUCCESS"}},
    {interference:{personId:"c",aidedSide:"X",plannedOutcome:"SUCCESS"}},
    {interference:{personId:"c",aidedSide:"A",plannedOutcome:"ABORTED"}},
    {interference:"SUCCESS"},
  ])assert.throws(()=>readBookedInterference(bad),/Invalid booked interference/);
  assert.throws(()=>previewArchivedInterference(injury,booked,
    {...available,presentation:null}),/Missing interferer presentation/);
});
