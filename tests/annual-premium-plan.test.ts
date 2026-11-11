import test from "node:test";
import assert from "node:assert/strict";
import {defaults} from "../src/domain/show-calendar.js";
import {premiumPolicy,projectYearEvents,scheduledSeriesOnWeek,
 suggestedAnnualPremiumEvents,validateAnnualPremiumEvents}
 from "../src/domain/annual-premium-plan.js";
test("promotion tiers give realistic yearly premium limits and broad spacing",()=>{
 assert.deepEqual(["LOCAL","INDEPENDENT","RISING","NATIONAL","GLOBAL"]
  .map(t=>premiumPolicy(t as "LOCAL")),[
  {minimum:2,maximum:4,recommended:3,minGap:8},
  {minimum:2,maximum:4,recommended:4,minGap:8},
  {minimum:4,maximum:8,recommended:6,minGap:4},
  {minimum:10,maximum:12,recommended:10,minGap:3},
  {minimum:10,maximum:12,recommended:11,minGap:3}
 ]);
});
test("a World with no annual override retains the original yearly PPV identity",()=>{
 const s=defaults("Example",1,4);
 assert.deepEqual(projectYearEvents(s,1).map(e=>e.week),
  Array.from({length:13},(_,i)=>4*(i+1)));
 assert.equal(scheduledSeriesOnWeek(s,1,4)[1]?.name,"Example Premium");
 const proposed=suggestedAnnualPremiumEvents(s,"LOCAL",2,"Example");
 assert.equal(proposed.length,3);
 assert.deepEqual(proposed.map(x=>x.week),[12,29,46]);
 validateAnnualPremiumEvents({year:2,tier:"LOCAL",events:proposed,series:s});
 const plans=new Map([[2,proposed]]);
 assert.equal(scheduledSeriesOnWeek(s,2,4,plans).length,1);
 assert.equal(scheduledSeriesOnWeek(s,2,12,plans).length,2);
 assert.equal(scheduledSeriesOnWeek(s,1,4,plans).length,2,
  "Year 1 has not been rewritten by Year 2's player commitment");
});
test("overscheduling, short gaps, duplicate weeks and invalid identities fail",()=>{
 const series=defaults("Example",1,4);
 const three=suggestedAnnualPremiumEvents(series,"LOCAL",2,"Example");
 const check=(events:typeof three)=>validateAnnualPremiumEvents({
  year:2,tier:"LOCAL",events,series});
 assert.throws(()=>check(Array.from({length:5},(_,i)=>({
  seriesId:three[0]!.seriesId,week:2+i*10
 }))),/cannot schedule more/);
 assert.throws(()=>check([...three,{...three[0]!,week:13}]),/weeks between/);
 assert.throws(()=>check([...three,three[0]!]),/one PPV/i);
 assert.throws(()=>check([{seriesId:"not in promotion",week:2}]),/existing active/);
 assert.throws(()=>check([{...three[0]!,week:0}]),/World week/);
 assert.throws(()=>check([{...three[0]!,week:53}]),/World week/);
});
test("certified/dated cards survive year editing and World New Year",()=>{
 const s=defaults("Example",1,4);
 const e=suggestedAnnualPremiumEvents(s,"RISING",2,"Example");
 validateAnnualPremiumEvents({year:2,tier:"RISING",events:e,series:s,
  previous:[{seriesId:e[0]!.seriesId,week:49}]});
 assert.throws(()=>validateAnnualPremiumEvents({year:2,tier:"LOCAL",
  events:[{seriesId:e[0]!.seriesId,week:3}],series:s,
  previous:[{seriesId:e[0]!.seriesId,week:50}]}),/after the previous year/);
 assert.throws(()=>validateAnnualPremiumEvents({year:2,tier:"RISING",
  events:e,series:s,grandfathered:[{seriesId:e[0]!.seriesId,week:21}]}),
  /cannot be cancelled/);
 validateAnnualPremiumEvents({year:2,tier:"LOCAL",events:e.slice(0,2),
  series:s,grandfathered:[{week:e[0]!.week,seriesId:null}]});
});
test("historic WWE/AEW annual event names are never replaced or invented",()=>{
 for(const name of ["WWE","AEW"]){
  const s=defaults(name,1,4);
  const plans=suggestedAnnualPremiumEvents(s,"GLOBAL",3,name);
  assert.deepEqual(plans,projectYearEvents(s,3));
  validateAnnualPremiumEvents({year:3,tier:"GLOBAL",events:plans,
   series:s,originalName:name});
 }
});
