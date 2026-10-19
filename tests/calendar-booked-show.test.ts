import test from "node:test";
import assert from "node:assert/strict";
import {calendarBookingForSeries,calendarBookingLocation,calendarBookingState}
 from "../src/ui/calendar-booked-show.js";
import type {ShowSeries} from "../src/domain/show-calendar.js";
import type {CalendarBooking} from "../src/db/calendar-workspace.js";
const regular:ShowSeries={seriesId:"weekly",name:"Weekly",role:"FLAGSHIP",
 eventType:"REGULAR",cadenceWeeks:1,anchorWeek:0,importance:75,active:true};
const major:ShowSeries={...regular,seriesId:"ppv",name:"Supercard",
 role:"PREMIUM",eventType:"MAJOR",importance:95};
const booked:CalendarBooking={draftId:"draft-1",year:1,week:5,
 bookingClass:"REGULAR",showSeriesId:"weekly",showName:"Weekly",status:"DRAFT",
 day:5,venueName:"City Hall",marketName:"Midlands",ready:false};
test("Calendar links owner-only matching series and never guesses from another show",()=>{
 assert.equal(calendarBookingForSeries(regular,1,5,[regular,major],[booked])?.draftId,"draft-1");
 assert.equal(calendarBookingForSeries(major,1,5,[regular,major],[booked]),null);
 assert.equal(calendarBookingForSeries(regular,1,6,[regular],[booked]),null);
 assert.equal(calendarBookingForSeries(regular,1,5,[regular,major],
  [{...booked,showSeriesId:null}])?.draftId,"draft-1");
 assert.equal(calendarBookingForSeries(regular,1,5,[regular,{...regular,seriesId:"other"}],
  [{...booked,showSeriesId:null}]),null);
 assert.equal(calendarBookingForSeries(major,1,5,[regular,major],
  [{...booked,bookingClass:"PREMIUM",showSeriesId:null}])?.draftId,"draft-1");
});
test("Calendar presents only documented status and verified venue",()=>{
 assert.equal(calendarBookingState(booked),"Card in progress");
 assert.equal(calendarBookingState({...booked,ready:true}),"Card ready");
 assert.equal(calendarBookingState({...booked,status:"SUBMITTED"}),"Submitted for lock");
 assert.equal(calendarBookingLocation(booked),"Day 5 · City Hall · Midlands");
 assert.equal(calendarBookingLocation({...booked,day:null,venueName:null,
  marketName:null}),"Venue and day not selected");
});
