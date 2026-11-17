/** Read-only six-week production status from the authoritative Planner snapshot.
 * Event identity comes from confirmed recurring/annual dates; card readiness
 * never treats a draft as a submitted show or a planned PPV as an actual result.
 */
import type {PlannerWeek,ActiveProgrammeOutline} from "../db/planner-workspace.js";

export type BuildWeekState=
 "NO_SHOW_DUE"|"UNBOOKED"|"CARD_IN_PROGRESS"|"READY_FOR_LOCK"|"SUBMITTED"|"PARTIALLY_BOOKED";

export interface BuildWeek{
 year:number;week:number;offset:number;key:string;
 state:BuildWeekState;label:string;eventNames:string[];
 premiumName:string|null;isPremium:boolean;missingShows:number;
 draftCount:number;preparedCount:number;submittedCount:number;showCount:number;
}

export interface ProgrammeBuildLane{
 programmeId:string;name:string;
 chapters:{year:number;week:number;matches:number;segments:number;
  submitted:boolean;editableDraftId:string|null;finalePayoff:string|null}[];
}
export interface SixWeekBuild{
 weeks:BuildWeek[];
 nextPremium:{year:number;week:number;offset:number;name:string}|null;
 programmes:ProgrammeBuildLane[];programmeCount:number;
 submittedShows:number;preparedShows:number;scheduledShows:number;
 unsubmittedWeeks:number;needsActionWeeks:number;
}

const key=(year:number,week:number)=>year+"-"+week;

/** A show with a ready fingerprint is still a draft until it is submitted. */
export function buildSixWeekProduction(weeks:readonly PlannerWeek[],
 activeProgrammes:readonly ActiveProgrammeOutline[]=[]):SixWeekBuild{
 const ordered=[...weeks].sort((a,b)=>a.offset-b.offset);
 const mapped:BuildWeek[]=ordered.map(w=>{
  const expected=new Set(w.scheduled.map(s=>s.eventType==="MAJOR"?"PREMIUM":"REGULAR"));
  const actual=new Set(w.shows.map(s=>s.bookingClass));
  const missing=[...expected].filter(x=>!actual.has(x)).length;
  const submitted=w.shows.filter(s=>s.status==="SUBMITTED").length;
  const drafts=w.shows.filter(s=>s.status==="DRAFT");
  const prepared=drafts.filter(s=>s.ready).length;
  const incomplete=drafts.some(s=>!s.ready);
  let state:BuildWeekState;
  if(!w.shows.length&&!w.scheduled.length)state="NO_SHOW_DUE";
  else if(!w.shows.length)state="UNBOOKED";
  else if(missing)state="PARTIALLY_BOOKED";
  else if(incomplete)state=prepared||submitted?"PARTIALLY_BOOKED":"CARD_IN_PROGRESS";
  else if(drafts.length)state="READY_FOR_LOCK";
  else state="SUBMITTED";
  const premium=w.shows.find(s=>s.bookingClass==="PREMIUM");
  const announced=w.scheduled.find(s=>s.eventType==="MAJOR");
  return {
   year:w.year,week:w.week,offset:w.offset,key:key(w.year,w.week),
   state,label:state==="NO_SHOW_DUE"?"No show due":
    state==="UNBOOKED"?"Not booked":
    state==="CARD_IN_PROGRESS"?"Finish card":
    state==="READY_FOR_LOCK"?"Prepared for lock":
    state==="SUBMITTED"?"Submitted":"Review cards",
   eventNames:w.scheduled.map(s=>s.name),
   premiumName:premium?.showName??announced?.name??null,
   isPremium:Boolean(premium||announced),missingShows:missing,
   draftCount:drafts.length,preparedCount:prepared,
   submittedCount:submitted,showCount:w.shows.length
  };
 });
 const next=mapped.find(w=>w.premiumName!==null);
 // Show actual player-authored programme links, not a forecast of future angles.
 // Multiple acts of one Programme in a week are combined, and drafts retain
 // their provisional status until the canonical card has been submitted.
 const laneMap=new Map<string,ProgrammeBuildLane>();
 for(const week of ordered)for(const show of week.shows){
  for(const chapter of show.programmeChapters??[]){
   let lane=laneMap.get(chapter.programmeId);
   if(!lane){
    lane={programmeId:chapter.programmeId,name:chapter.name,chapters:[]};
    laneMap.set(chapter.programmeId,lane);
   }
   const existing=lane.chapters.find(c=>c.year===week.year&&c.week===week.week);
   if(existing){
    existing.matches+=chapter.matches;existing.segments+=chapter.segments;
    existing.submitted=existing.submitted&&show.status==="SUBMITTED";
    if(show.status==="DRAFT")existing.editableDraftId=show.draftId;
    if(chapter.finalePayoff)existing.finalePayoff=chapter.finalePayoff;
   }else lane.chapters.push({year:week.year,week:week.week,
    matches:chapter.matches,segments:chapter.segments,
    submitted:show.status==="SUBMITTED",
    editableDraftId:show.status==="DRAFT"?show.draftId:null,
    finalePayoff:chapter.finalePayoff??null});
  }
 }
 // A real, active feud without any advance booking remains visible as a
 // planning gap. It has no invented match, angle, or promised outcome.
 for(const programme of activeProgrammes){
  if(laneMap.has(programme.programmeId))continue;
  laneMap.set(programme.programmeId,{...programme,chapters:[]});
 }
 return {
  weeks:mapped,programmes:[...laneMap.values()].slice(0,8),
  programmeCount:laneMap.size,
  nextPremium:next&&next.premiumName?{
   year:next.year,week:next.week,offset:next.offset,name:next.premiumName
  }:null,
  submittedShows:mapped.reduce((sum,w)=>sum+w.submittedCount,0),
  preparedShows:mapped.reduce((sum,w)=>sum+w.preparedCount,0),
  needsActionWeeks:mapped.filter(w=>w.state!=="SUBMITTED"&&
   w.state!=="READY_FOR_LOCK"&&w.state!=="NO_SHOW_DUE").length,
  scheduledShows:mapped.reduce((sum,w)=>sum+
   Math.max(w.showCount,new Set(w.eventNames).size),0),
  unsubmittedWeeks:mapped.filter(w=>w.state!=="SUBMITTED"&&
   w.state!=="NO_SHOW_DUE").length
 };
}
