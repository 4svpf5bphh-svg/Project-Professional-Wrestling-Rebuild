/** Verified show-to-next-show handoff, with no speculative simulation or tasks.
 * This is an editorial checklist drawn only from the already loaded private
 * completed-show receipt. It never implies historical consequences are still
 * live, orders an action, or changes the World.
 */
import type {CompletedShowView} from "../db/show-results-view.js";

export type NextStepDestination="roster"|"championships"|"programmes"|"planner"|"staff";
export interface PostShowNextStep{
 key:"medical"|"title"|"cooling"|"hot"|"standout"|"production"|"plan";
 eyebrow:string;headline:string;detail:string;
 destination:NextStepDestination;action:string;
}
export interface PostShowHandoff{
 actions:PostShowNextStep[];standout:string|null;
}
/** At most 3 contextual items plus an always available player-controlled
 * return to booking. No one must complete these before advancing the World. */
export function postShowHandoff(show:CompletedShowView):PostShowHandoff{
 const entries=show.entries;
 const priorities:PostShowNextStep[]=[];
 const medical=entries.flatMap(e=>e.fallout?.injuries??[]);
 if(medical.length){
  const names=[...new Set(medical.map(p=>p.personName))].slice(0,3);
  priorities.push({key:"medical",eyebrow:"MEDICAL RECORD",
   headline:"Check today's availability",
   detail:"This show recorded "+names.join(", ")+
    (medical.length>3?" and others":"")+
    " as injured. Review their current status before planning another appearance.",
   destination:"roster",action:"Check roster"});
 }
 const title=entries.find(e=>e.fallout?.title?.changed)?.fallout?.title;
 if(title)priorities.push({key:"title",eyebrow:"TITLE HISTORY",
  headline:"A new champion was crowned",
  detail:title.winnerName+" won "+title.name+" on this show. Review who holds it now before planning a defence.",
  destination:"championships",action:"View championships"});
 const cool=entries.find(e=>e.type==="MATCH"&&
  ["COOL_PROGRAMME","PROGRAMME_REPETITION"].includes(e.fallout?.programmeSignal??""));
 if(cool)priorities.push({key:"cooling",eyebrow:"CREATIVE DIRECTION",
  headline:"A rivalry needs a fresh chapter",
  detail:cool.fallout?.programmeSignal==="PROGRAMME_REPETITION"?
   "The verified result flagged repetition in "+cool.headline+
   ". Consider a different angle or opposition before booking that story again.":
   cool.headline+" produced a cooling rivalry signal. Decide whether the programme needs a new direction.",
  destination:"programmes",action:"Review programmes"});
 const hot=entries.find(e=>e.type==="MATCH"&&
  e.fallout?.programmeSignal==="HOT_PROGRAMME");
 if(hot&&!cool)priorities.push({key:"hot",eyebrow:"CREATIVE OPPORTUNITY",
  headline:"A rivalry caught fire",
  detail:hot.headline+" had a verified hot-programme signal. If you continue it, give the next chapter a purpose.",
  destination:"programmes",action:"Develop programme"});
 const strong=entries.filter(e=>e.type==="MATCH"&&
  typeof e.fallout?.ratingStars==="number"&&
  Number.isFinite(e.fallout.ratingStars)).sort((a,b)=>
   (b.fallout?.ratingStars??0)-(a.fallout?.ratingStars??0)||
   b.crowdResponse-a.crowdResponse)[0];
 const standout=strong&&strong.fallout!.ratingStars!>=4?
  strong.headline+" earned "+strong.fallout!.ratingStars!.toFixed(2)+
  " verified stars. Consider how to follow that performance, rather than repeating the same match immediately.":
  null;
 if(strong&&strong.fallout!.ratingStars!>=4&&!hot&&!cool){
  priorities.push({key:"standout",eyebrow:"BUILD ON THE SHOW",
   headline:"Give the standout a follow-up",
   detail:standout!,
   destination:"planner",action:"Open show planner"});
 }
 if(show.gorillaLog?.incidents.length)
  priorities.push({key:"production",eyebrow:"PRODUCTION",
   headline:"Review curtain decisions",
   detail:show.gorillaLog.incidents.length+" production incident"+
    (show.gorillaLog.incidents.length===1?" was":"s were")+
    " recorded on this show. The saved Gorilla Log below has the evidence.",
   destination:"staff",action:"Open staff office"});
 const actions=priorities.slice(0,3);
 actions.push({key:"plan",eyebrow:"YOUR NEXT SHOW",
  headline:"Write the next chapter",
  detail:"Use your existing six-week planner. Nothing has been booked or changed by this report.",
  destination:"planner",action:"Plan a show"});
 return {actions,standout};
}
