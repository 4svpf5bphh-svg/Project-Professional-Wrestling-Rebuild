import test from "node:test";
import assert from "node:assert/strict";
import {evolveWorkingPartnership} from "../src/domain/working-relationship-evolution.js";
const good={goodShows12:2,poorShows10:0,hasGood12:true,
 currentExecution:80,currentWeekIndex:12};
test("two independently completed excellent tag shows establish professional trust",()=>{
 assert.equal(evolveWorkingPartnership({...good,goodShows12:1},null),null);
 assert.deepEqual(evolveWorkingPartnership(good,null),{
  kind:"IMPROVEMENT",professionalTrust:50.8,familiarity:2,
  trustDelta:0.8,familiarityDelta:2,verifiedShows:2,
 });
});
test("original eight-week improvement cooldown is independent of winning",()=>{
 const prior={professionalTrust:60,familiarity:12,
  lastImprovedWeekIndex:10,lastStrainedWeekIndex:null};
 assert.equal(evolveWorkingPartnership(good,prior),null);
 assert.equal(evolveWorkingPartnership({...good,currentWeekIndex:18},prior)?.professionalTrust,60.8);
});
test("three poor verified tag shows strain established confidence but not personal affinity",()=>{
 const e={...good,currentExecution:35,goodShows12:0,poorShows10:3,
  hasGood12:false,currentWeekIndex:31};
 const prior={professionalTrust:62,familiarity:15,
  lastImprovedWeekIndex:15,lastStrainedWeekIndex:null};
 assert.deepEqual(evolveWorkingPartnership(e,prior),{
  kind:"STRAIN",professionalTrust:61.4,familiarity:15,
  trustDelta:-0.6,familiarityDelta:0,verifiedShows:3,
 });
 assert.equal(evolveWorkingPartnership({...e,hasGood12:true},prior),null);
 assert.equal(evolveWorkingPartnership(e,{...prior,familiarity:10}),null);
 assert.equal(evolveWorkingPartnership(e,{...prior,lastStrainedWeekIndex:22}),null);
});
test("high seeded trust never drops to the growth ceiling",()=>{
 assert.equal(evolveWorkingPartnership(good,{
  professionalTrust:91,familiarity:10,
  lastImprovedWeekIndex:null,lastStrainedWeekIndex:null,
 })?.professionalTrust,91);
});
