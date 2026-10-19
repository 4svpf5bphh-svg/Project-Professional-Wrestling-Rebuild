import test from "node:test";
import assert from "node:assert/strict";
import {readInjuryIncidents} from "../src/domain/career-injury-incidents.js";
const incident={showId:"event",matchId:"main",year:1,week:8,
 severity:"MODERATE",originalWeeksOut:5,promotion:"AEW",format:"TAG"};
test("medical archive accepts at most six sourced incidents",()=>{
 assert.deepEqual(readInjuryIncidents([incident]),[incident]);
 assert.deepEqual(readInjuryIncidents(Array.from({length:7},()=>incident)),[]);
 assert.deepEqual(readInjuryIncidents(null),[]);
});
test("unknown/invalid recovery claims do not enter verified incident history",()=>{
 assert.deepEqual(readInjuryIncidents([{...incident,year:0},
  {...incident,week:53},{...incident,originalWeeksOut:0},
  {...incident,severity:"HEALED"},{...incident,format:"PROMO"},
  {...incident,showId:""},{...incident,week:12}]),
  [],"Seven records exceed the strict six-incident cap");
 assert.deepEqual(readInjuryIncidents([{...incident,severity:"RECOVERED"},incident]),
  [incident],"Invalid records cannot imply clearance");
});
