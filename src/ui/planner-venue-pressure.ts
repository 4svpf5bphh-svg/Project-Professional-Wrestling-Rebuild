/** Anonymous, provisional venue interest shown without opponent identity.
 * Counts never grant or deny a show booking.
 */
import type {PlannerView} from "../db/planner-workspace.js";

export function venuePressureCount(view:PlannerView,year:number,week:number,
 day:number,venueId:string):number{
 return view.venuePressure?.find(p=>p.year===year&&p.week===week&&
  p.day===day&&p.venueId===venueId)?.otherPromotions??0;
}
export function freeVenueDays(view:PlannerView,year:number,week:number,
 venueId:string):number[]{
 return [1,2,3,4,5,6,7].filter(day=>
  venuePressureCount(view,year,week,day,venueId)===0);
}
