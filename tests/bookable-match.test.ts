import assert from "node:assert/strict";
import test from "node:test";
import {normalizeBookableMatch} from "../src/domain/bookable-match.js";
import {readCanonicalMatchLayout,requireSupportedScoringLayout,sideIdAt}
 from "../src/domain/match-sides.js";
const person=(i:number)=>({personId:"person-"+i,contractId:"contract-"+i});
const make=(teams:number,size:number,royal=false)=>{
 const participants=Array.from({length:teams*size},(_,i)=>person(i));
 const sides=Array.from({length:teams},(_,i)=>({sideId:sideIdAt(i),
  participants:participants.slice(i*size,(i+1)*size)}));
 return {matchType:royal?"BATTLE_ROYAL":size===1?"SINGLES":"TAG",
  family:size===1?"INDIVIDUAL":"TEAMS",sides,participants,
  scriptedWinnerSide:sides.at(-1)!.sideId,
  ruleset:"ELIMINATION",eliminationOrder:sides.slice(0,-1).map(s=>s.sideId),
  plannedFinish:royal?"OVER_THE_TOP_ROPE":"CLEAN_PIN",
  intent:"EPIC",plannedLengthMinutes:26};
};
test("editor emits canonical 1v1, 3-way, trios, 4v4 and 30-person battle royal",()=>{
 const setups=[[2,1,false],[3,1,false],[2,3,false],
  [2,4,false],[3,2,false],[30,1,true]] as const;
 for(const [teams,size,royal] of setups){
  const raw=make(teams,size,royal);
  // The 1v1 elimination display has no special result rules, still valid.
  const data=normalizeBookableMatch(raw);
  assert.equal(data.participants.length,teams*size);
  assert.deepEqual(data.eliminationOrder,raw.eliminationOrder);
  assert.equal(data.scriptedWinnerSide,raw.scriptedWinnerSide);
  assert.equal(data.scriptedWinner,size===1?raw.participants.at(-1)!.personId:undefined);
  assert.doesNotThrow(()=>requireSupportedScoringLayout(readCanonicalMatchLayout(data)));
 }
});
test("browser cannot edit medical winners, forge fields or book unsupported combinations",()=>{
 const royal=make(20,1,true);
 assert.throws(()=>normalizeBookableMatch({...royal,plannedFinish:"CLEAN_PIN"}),/Battle royal|finish/);
 assert.throws(()=>normalizeBookableMatch({...royal,
  eliminationOrder:[...royal.eliminationOrder.slice(0,-1),"T"]}),/Eliminations/);
 assert.throws(()=>normalizeBookableMatch({...royal,interference:{
  personId:"outsider",aidedSide:"A",plannedOutcome:"SUCCESS"}}),/spots/);
 const teams=make(3,2,false);
 assert.throws(()=>normalizeBookableMatch({...teams,championshipId:"belt"}),/championship/);
 const one=make(2,1,false);
 assert.throws(()=>normalizeBookableMatch({...one,sides:[
  {sideId:"A",participants:[person(0)]},
  {sideId:"B",participants:[person(0)]}]}),/repeated|disagree/);
});
