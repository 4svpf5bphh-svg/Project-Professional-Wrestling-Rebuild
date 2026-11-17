/** Read-only six-week production status from the authoritative Planner snapshot.
 * Event identity comes from confirmed recurring/annual dates; card readiness
 * never treats a draft as a submitted show or a planned PPV as an actual result.
 */
import type {PlannerWeek} from "../db/planner-workspace.js";

export type BuildWeekState=
 "UNBOOKED"|"CARD_IN_PROGRESS"|"READY_TO_SUBMIT"|"SUBMITTED"|"PARTIALLY_BOOKED";

export interface BuildWeek{
 year:number;week:number;offset:number;key:string;
 state:BuildWeekState;label:string;eventNames:string[];
 premiumName:string|null;isPremium:boolean;missingShows:number;
 draftCount:number;submittedCount:number;showCount:number;
}

export interface SixWeekBuild{
 weeks:BuildWeek[];
 nextPremium:{year:number;week:number;offset:number;name:string}|null;
 submittedShows:number;scheduledShows:number;unsubmittedWeeks:number;
}

const key=(year:number,week:number)=>year+"-"+week;

/** A show with a ready fingerprint is still a draft until it is submitted. */
export function buildSixWeekProduction(weeks:readonly PlannerWeek[]):SixWeekBuild{
 const ordered=[...weeks].sort((a,b)=>a.offset-b.offset);
 const mapped:BuildWeek[]=ordered.map(w=>{
  const expected=new Set(w.scheduled.map(s=>s.eventType==="MAJOR"?"PREMIUM":"REGULAR"));
  const actual=new Set(w.shows.map(s=>s.bookingClass));
  const missing=[...expected].filter(x=>!actual.has(x)).length;
  const submitted=w.shows.filter(s=>s.status==="SUBMITTED").length;
  const drafts=w.shows.filter(s=>s.status==="DRAFT");
  let state:BuildWeekState;
  if(!w.shows.length)state="UNBOOKED";
  else if(missing||submitted>0&&submitted<w.shows.length)state="PARTIALLY_BOOKED";
  else if(drafts.some(s=>!s.ready))state="CARD_IN_PROGRESS";
  else if(drafts.length)state="READY_TO_SUBMIT";
  else state="SUBMITTED";
  const premium=w.shows.find(s=>s.bookingClass==="PREMIUM");
  const announced=w.scheduled.find(s=>s.eventType==="MAJOR");
  return {
   year:w.year,week:w.week,offset:w.offset,key:key(w.year,w.week),
   state,label:state==="UNBOOKED"?"Not booked":
    state==="CARD_IN_PROGRESS"?"Finish card":
    state==="READY_TO_SUBMIT"?"Submit card":
    state==="SUBMITTED"?"Submitted":"Review cards",
   eventNames:w.scheduled.map(s=>s.name),
   premiumName:premium?.showName??announced?.name??null,
   isPremium:Boolean(premium||announced),missingShows:missing,
   draftCount:drafts.length,submittedCount:submitted,showCount:w.shows.length
  };
 });
 const next=mapped.find(w=>w.premiumName!==null);
 return {
  weeks:mapped,
  nextPremium:next&&next.premiumName?{
   year:next.year,week:next.week,offset:next.offset,name:next.premiumName
  }:null,
  submittedShows:mapped.reduce((sum,w)=>sum+w.submittedCount,0),
  scheduledShows:mapped.reduce((sum,w)=>sum+
   Math.max(w.showCount,new Set(w.eventNames).size),0),
  unsubmittedWeeks:mapped.filter(w=>w.state!=="SUBMITTED").length
 };
}
