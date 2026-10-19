/** Shared calendar-to-planner identity for a private scheduled show.
 * Match the actual series first; legacy drafts without a series may inherit
 * a class only when there is exactly one matching broadcast that week.
 */
import type {CalendarBooking} from "../db/calendar-workspace.js";
import type {ShowSeries} from "../domain/show-calendar.js";
export function calendarBookingForSeries(
 series:ShowSeries,year:number,week:number,
 due:readonly ShowSeries[],bookings:readonly CalendarBooking[]
):CalendarBooking|null{
 const weekBookings=bookings.filter(b=>b.year===year&&b.week===week);
 const exact=weekBookings.find(b=>b.showSeriesId===series.seriesId);
 if(exact)return exact;
 const broadcastClass=series.eventType==="MAJOR"?"PREMIUM":"REGULAR";
 if(due.filter(s=>s.eventType===series.eventType).length!==1)return null;
 return weekBookings.find(b=>b.showSeriesId===null&&
  b.bookingClass===broadcastClass)??null;
}
export function calendarBookingState(b:CalendarBooking):string{
 return b.status==="SUBMITTED"?"Submitted for lock":
  b.ready?"Card ready":"Card in progress";
}
export function calendarBookingLocation(b:CalendarBooking):string{
 const parts=[b.day!==null?"Day "+b.day:null,b.venueName,b.marketName]
  .filter((s):s is string=>typeof s==="string");
 return parts.length?parts.join(" · "):"Venue and day not selected";
}
