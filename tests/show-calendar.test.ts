import test from "node:test";
import assert from "node:assert/strict";
import {defaults,occurrences,seriesDue,validateSchedule,weekIndex,
 type ShowSeries} from "../src/domain/show-calendar.js";
test("52-week recurrence crosses a PPW year without duplicated database rows",()=>{
 const shows=defaults("Example",1,4);
 assert.deepEqual(occurrences(shows,weekIndex(1,51),4).map(w=>[
  w.year,w.week,w.shows.map(s=>s.role)]),[
  [1,51,["FLAGSHIP"]],[1,52,["FLAGSHIP","PREMIUM"]],
  [2,1,["FLAGSHIP"]],[2,2,["FLAGSHIP"]]]);
 assert.equal(seriesDue(shows[1]!,51),true);
});
test("A/B normal shows alternate without multiplying weekly broadcast slots",()=>{
 const a={...defaults("Example",1,4)[0]!,cadenceWeeks:2,anchorWeek:0};
 const b:ShowSeries={...a,seriesId:"secondary",name:"Show B",
  role:"SECONDARY",anchorWeek:1};
 validateSchedule([a,b]);
 assert.deepEqual(occurrences([a,b],0,6).map(w=>w.shows[0]?.name),
  ["Example Flagship","Show B","Example Flagship","Show B",
   "Example Flagship","Show B"]);
 assert.throws(()=>validateSchedule([a,{...b,anchorWeek:0}]),/one normal/i);
});
test("Premium recurring series may share a week with a single A/B show",()=>{
 const [flagship,premium]=defaults("Example",1,4);
 validateSchedule([flagship!,premium!]);
 assert.deepEqual(occurrences([flagship!,premium!],3,1)[0]!.shows.map(s=>s.role),
  ["FLAGSHIP","PREMIUM"]);
 assert.throws(()=>validateSchedule([{...flagship!,role:"PREMIUM"}]),/mixed/);
 assert.throws(()=>validateSchedule([premium!]),/flagship/);
});
