/** One owner-only annual calendar projection. Recurring TV, confirmed or
 * suggested annual PPVs and real booked drafts share a single week identity.
 * No extra Neon read; status is never inferred from a merely announced show. */
import {seriesDue,weekIndex,type ShowSeries} from "../domain/show-calendar.js";
import type {CalendarBooking,PremiumCalendarEdition}
 from "../db/calendar-workspace.js";
import type {AnnualPremiumEvent} from "../domain/annual-premium-plan.js";
import {calendarBookingForSeries} from "./calendar-booked-show.js";

export interface YearWeekEvent{
 seriesId:string;eventType:"REGULAR"|"MAJOR";name:string;
 /** Proposed annual dates must not masquerade as confirmed bookings. */
 announced:boolean;booked:boolean;
 draftId:string|null;status:"DRAFT"|"SUBMITTED"|"CERTIFIED"|"SCHEDULED"|"SUGGESTED";
 ready:boolean;day:number|null;venueName:string|null;
}
export function yearWeekEvents(input:{
 year:number;week:number;series:readonly ShowSeries[];
 annualEvents:readonly AnnualPremiumEvent[];annualConfirmed:boolean;
 bookings:readonly CalendarBooking[];premiumEditions:readonly PremiumCalendarEdition[];
}):YearWeekEvent[]{
 const {year,week,series,annualEvents,annualConfirmed,bookings,premiumEditions}=input;
 const index=weekIndex(year,week);
 const due=series.filter(s=>s.active&&s.eventType==="REGULAR"&&seriesDue(s,index));
 const result:YearWeekEvent[]=due.map(s=>{
  const booking=calendarBookingForSeries(s,year,week,due,bookings);
  return {seriesId:s.seriesId,eventType:"REGULAR",
   name:booking?.showName??s.name,announced:true,booked:!!booking,
   draftId:booking?.draftId??null,
   status:booking?(booking.status==="SUBMITTED"?"SUBMITTED":"DRAFT"):"SCHEDULED",
   ready:booking?.ready??false,
   day:booking?.day??null,venueName:booking?.venueName??null};
 });
 const edition=premiumEditions.find(b=>b.year===year&&b.week===week);
 const planned=annualEvents.find(e=>e.week===week);
 const identity=series.find(s=>s.seriesId===(edition?.showSeriesId??planned?.seriesId));
 if(planned||edition){
  const booking=identity?calendarBookingForSeries(identity,year,week,[identity],bookings):null;
  const booked=Boolean(edition||booking);
  const name=edition?.showName??booking?.showName??planned?.name??identity?.name??
   "Premium event";
  result.push({seriesId:edition?.showSeriesId??planned?.seriesId??"",
   eventType:"MAJOR",name,announced:annualConfirmed||booked,booked,
   draftId:edition?.draftId??booking?.draftId??null,
   status:edition?.certified?"CERTIFIED":
    edition?.status==="SUBMITTED"||booking?.status==="SUBMITTED"?"SUBMITTED":
    booked?"DRAFT":annualConfirmed?"SCHEDULED":"SUGGESTED",
   ready:edition?.ready??booking?.ready??false,
   day:booking?.day??null,venueName:booking?.venueName??null});
 }
 return result;
}
