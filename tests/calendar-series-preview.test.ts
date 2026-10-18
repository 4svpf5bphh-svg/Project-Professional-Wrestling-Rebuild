import test from "node:test";
import assert from "node:assert/strict";
import {calendarSeriesPreview,setSeriesCadence,SERIES_CADENCES}
 from "../src/ui/calendar-series-preview.js";
import {defaults,type ShowSeries} from "../src/domain/show-calendar.js";
const [flagship,premium]=defaults("Example",1,4);
test("frequency choices preserve one-based show weeks and clamp unsafe anchors",()=>{
 assert.deepEqual(SERIES_CADENCES.map(x=>x.weeks),[1,2,4,13,26,52]);
 assert.deepEqual(setSeriesCadence({...premium!,anchorWeek:43},4),
  {...premium!,cadenceWeeks:4,anchorWeek:3});
 assert.equal(setSeriesCadence(premium!,0).cadenceWeeks,0);
});
test("annual shows preview the next year across year-end with no SQL",()=>{
 const annual:ShowSeries={seriesId:"new",name:"Summer Showcase",role:"PREMIUM",
  eventType:"MAJOR",cadenceWeeks:52,anchorWeek:30,importance:95,active:true};
 const check=calendarSeriesPreview(annual,[flagship!],1,50);
 assert.equal(check.valid,true);
 assert.deepEqual(check.occurrences,[{year:2,week:31}]);
});
test("preview prevents overlapping major events and invalid repeat intervals before save",()=>{
 const annual:ShowSeries={seriesId:"new",name:"Clash",role:"SPECIAL",
  eventType:"MAJOR",cadenceWeeks:52,anchorWeek:premium!.anchorWeek,
  importance:85,active:true};
 assert.match(calendarSeriesPreview(annual,[flagship!,premium!],1,1).message,/one additional/i);
 assert.doesNotMatch(calendarSeriesPreview(annual,[flagship!,premium!],1,1).message,/PPW|World|simulation/i);
 assert.equal(calendarSeriesPreview({...annual,cadenceWeeks:0},[flagship!],1,1).valid,false);
 assert.equal(calendarSeriesPreview({...annual,anchorWeek:52},[flagship!],1,1).valid,false);
});
test("editing existing series is not counted as an extra conflicting event",()=>{
 const revised={...premium!,name:"Anniversary Spectacular",importance:98};
 const view=calendarSeriesPreview(revised,[flagship!,premium!],1,1);
 assert.equal(view.valid,true);
 assert.deepEqual(view.occurrences,[{year:1,week:4},{year:1,week:8},
  {year:1,week:12},{year:1,week:16}]);
});
