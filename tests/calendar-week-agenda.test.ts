import test from "node:test";
import assert from "node:assert/strict";
import {yearWeekEvents} from "../src/ui/calendar-week-agenda.js";
import type {ShowSeries} from "../src/domain/show-calendar.js";
import type {CalendarBooking,PremiumCalendarEdition}
 from "../src/db/calendar-workspace.js";

const flagship:ShowSeries={seriesId:"a",name:"CWA Ascension",
 role:"FLAGSHIP",eventType:"REGULAR",cadenceWeeks:2,
 anchorWeek:0,importance:70,active:true};
const premium:ShowSeries={seriesId:"p",name:"Extreme Warfare",
 role:"PREMIUM",eventType:"MAJOR",cadenceWeeks:52,
 anchorWeek:32,importance:90,active:true};
const tvBooking:CalendarBooking={draftId:"tv-33",year:1,week:33,
 bookingClass:"REGULAR",showSeriesId:"a",showName:"CWA Ascension",
 status:"DRAFT",day:4,venueName:"Arena",marketName:"Home",ready:true};
const bookedPpv:PremiumCalendarEdition={draftId:"ppv-33",year:1,week:33,
 showSeriesId:"p",showName:"The Lottery",status:"SUBMITTED",
 ready:true,certified:false};
const base={series:[flagship,premium],
 annualEvents:[{seriesId:"p",week:33,name:"Lottery Night"}],
 annualConfirmed:true,bookings:[tvBooking],
 premiumEditions:[bookedPpv]};
test("annual week separates true alternate-week TV and confirmed PPV without phantom drafts",()=>{
 assert.deepEqual(yearWeekEvents({year:1,week:30,...base}),[]);
 const tv=yearWeekEvents({year:1,week:31,...base});
 assert.deepEqual(tv.map(x=>x.name),["CWA Ascension"]);
 assert.equal(tv[0]?.status,"SCHEDULED");
 assert.equal(tv[0]?.draftId,null);
 const both=yearWeekEvents({year:1,week:33,...base});
 assert.deepEqual(both.map(x=>x.eventType),["REGULAR","MAJOR"]);
 assert.equal(both[0]?.status,"DRAFT");
 assert.equal(both[0]?.ready,true);
 assert.equal(both[0]?.day,4);
 assert.equal(both[1]?.name,"The Lottery");
 assert.equal(both[1]?.status,"SUBMITTED");
 assert.equal(both[1]?.draftId,"ppv-33");
});
test("unconfirmed annual proposals are distinguishable from real booked show identities",()=>{
 const tentative=yearWeekEvents({year:1,week:33,...base,
  annualConfirmed:false,bookings:[],premiumEditions:[]});
 assert.equal(tentative[0]?.booked,false);
 assert.equal(tentative[1]?.announced,false);
 assert.equal(tentative[1]?.status,"SUGGESTED");
 assert.equal(tentative[1]?.name,"Lottery Night");
 assert.equal(tentative[1]?.draftId,null);
 const protectedEdition=yearWeekEvents({year:1,week:33,...base,
  annualConfirmed:false});
 assert.equal(protectedEdition[1]?.announced,true);
 assert.equal(protectedEdition[1]?.status,"SUBMITTED");
});
test("legacy unlinked weekly show inherits a series only if one due broadcast exists",()=>{
 const legacy={...tvBooking,showSeriesId:null,showName:"CWA Legacy"};
 const events=yearWeekEvents({year:1,week:33,series:[flagship],
  annualEvents:[],annualConfirmed:true,bookings:[legacy],premiumEditions:[]});
 assert.deepEqual(events.map(x=>x.name),["CWA Legacy"]);
 assert.equal(events[0]?.draftId,legacy.draftId);
 assert.equal(events[0]?.booked,true);
});
test("year two shares recurrence but not Year 1 booked cards or editions",()=>{
 const next=yearWeekEvents({year:2,week:33,...base});
 assert.equal(next[0]?.booked,false);
 assert.equal(next[0]?.status,"SCHEDULED");
 assert.equal(next[1]?.name,"Lottery Night");
 assert.equal(next[1]?.booked,false);
});
