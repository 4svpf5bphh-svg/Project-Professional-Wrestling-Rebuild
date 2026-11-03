/** Certified, event-local notes for a Road Agent's post-show desk.
 * No invented backstage conversation, unrecorded chemistry or AI request.
 * All guidance is optional; the next booking is validated independently.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
export interface PostShowStaffObservation{
 key:"overrun"|"execution"|"chemistry"|"injury"|"rivalry"|"standout";
 headline:string;note:string;slotId:string;
}
export function postShowStaffObservations(show:CompletedShowView):PostShowStaffObservation[]{
 const matches=show.entries.filter(x=>x.type==="MATCH");
 const observations:PostShowStaffObservation[]=[];
 const add=(key:PostShowStaffObservation["key"],e:ShowResultEntry,
  headline:string,note:string)=>observations.push({key,slotId:e.slotId,headline,note});
 const injured=matches.find(e=>e.fallout?.injuries.length);
 if(injured){
  const names=[...new Set(injured.fallout!.injuries.map(x=>x.personName))];
  add("injury",injured,"Medical comes first",
   injured.headline+" recorded "+names.join(", ")+
   (names.length===1?" with an injury.":" with injuries.")+
   " Check current clearance before planning another match.");
 }
 const runLong=matches.map(entry=>({
  entry,overrun:entry.fallout?.actualMinutes!==undefined&&
   entry.matchContext?.plannedMinutes!==null&&
   entry.matchContext?.plannedMinutes!==undefined?
   entry.fallout.actualMinutes-entry.matchContext.plannedMinutes:0
 })).sort((a,b)=>b.overrun-a.overrun||a.entry.position-b.entry.position)[0];
 if(runLong&&runLong.overrun>=5)add("overrun",runLong.entry,
  "The running order ran long",
  runLong.entry.headline+" exceeded its planned time by "+runLong.overrun+
  " minutes. Review the next card's available time; the booked finish remains official.");
 const rough=[...matches].filter(e=>typeof e.fallout?.executionQuality==="number"&&
  e.fallout.executionQuality<55).sort((a,b)=>
   a.fallout!.executionQuality!-b.fallout!.executionQuality!||a.position-b.position)[0];
 if(rough)add("execution",rough,"The match execution needs attention",
  rough.headline+" recorded an execution concern. Consider a clearer match structure "+
  "before revisiting that pairing.");
 const difficult=[...matches].filter(e=>typeof e.fallout?.chemistryModifier==="number"&&
  e.fallout.chemistryModifier<=-3).sort((a,b)=>
   a.fallout!.chemistryModifier!-b.fallout!.chemistryModifier!||a.position-b.position)[0];
 if(difficult)add("chemistry",difficult,"The pairing didn't click",
  difficult.headline+" recorded a negative chemistry signal. A different role or opponent "+
  "may serve the programme better than immediately repeating the match.");
 const repetitive=matches.find(e=>e.fallout?.programmeSignal==="PROGRAMME_REPETITION"||
  e.fallout?.programmeSignal==="COOL_PROGRAMME");
 if(repetitive)add("rivalry",repetitive,"The rivalry needs a different beat",
  repetitive.headline+" carried a certified "+
  (repetitive.fallout?.programmeSignal==="PROGRAMME_REPETITION"?"repetition":"cooling")+
  " signal. Revisit the story in Programmes before booking the same confrontation.");
 const standout=[...matches].filter(e=>typeof e.fallout?.ratingStars==="number"&&
  Number.isFinite(e.fallout.ratingStars)&&e.fallout.ratingStars>=4)
  .sort((a,b)=>b.fallout!.ratingStars!-a.fallout!.ratingStars!||
   a.position-b.position)[0];
 if(standout)add("standout",standout,"One to build on",
  standout.headline+" earned "+standout.fallout!.ratingStars!.toFixed(2)+
  " stars. Give the follow-up its own reason to happen rather than running a copy.");
 return observations.slice(0,3);
}
