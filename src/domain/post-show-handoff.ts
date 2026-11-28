/** Show-to-next-show leads drawn from the private completed-show receipt.
 * Historical events can link to current workspaces for a fresh decision.
 */
import type {CompletedShowView} from "../db/show-results-view.js";

export type NextStepDestination="home"|"roster"|"championships"|"programmes"|"planner"|"staff";
export interface PostShowNextStep{
 key:"medical"|"title"|"cooling"|"hot"|"programme"|"production";
 eyebrow:string;headline:string;detail:string;
 destination:NextStepDestination;action:string;
 /** Which completed match supports this suggestion; never a current booking ID. */
 evidenceSlotId?:string;
 personId?:string; // certified participant identity, not a name guess
 programmeId?:string;
 championshipId?:string;
}
export interface PostShowHandoff{
 actions:PostShowNextStep[];standout:string|null;
}
/** At most three actual certified concerns. PPW's existing Planner is always
 * in navigation: don't instruct the player to book their next show. */
export function postShowHandoff(show:CompletedShowView):PostShowHandoff{
 const entries=show.entries;
 const priorities:PostShowNextStep[]=[];
 const recordedPerson=(entry:CompletedShowView["entries"][number]|undefined,
  name:string):string|undefined=>{
  const members=entry?.matchContext?.sideParticipants?.flat().filter(x=>x.name===name)??[];
  return members.length===1?members[0]?.personId:undefined;
 };
 const medical=entries.flatMap(e=>e.fallout?.injuries??[]);
 if(medical.length){
  const names=[...new Set(medical.map(p=>p.personName))].slice(0,3);
  priorities.push({key:"medical",eyebrow:"MEDICAL RECORD",
   headline:"Check today's availability",
   detail:"This show recorded "+names.join(", ")+
    (medical.length>3?" and others":"")+
    " as injured. Review their current status before planning another appearance.",
   destination:"roster",action:"Check roster",
   evidenceSlotId:entries.find(e=>e.fallout?.injuries?.length)?.slotId,
   ...(medical.length===1?{
    personId:recordedPerson(entries.find(e=>e.fallout?.injuries?.some(i=>
     i.personName===medical[0]!.personName)),medical[0]!.personName)
   }:{})});
 }
 const titleEntry=entries.find(e=>e.fallout?.title?.changed);
 const title=titleEntry?.fallout?.title;
 if(title)priorities.push({key:"title",eyebrow:"TITLE HISTORY",
  headline:"A new champion was crowned",
  detail:title.winnerName+" won "+title.name+" on this show. Review who holds it now before planning a defence.",
  destination:"championships",action:"View championships",
  evidenceSlotId:titleEntry?.slotId,
  personId:recordedPerson(titleEntry,title.winnerName),
  championshipId:title.championshipId});
 const exactProgramme=(entry:CompletedShowView["entries"][number])=>
  entry.programmeChapters?.length===1?entry.programmeChapters[0]?.programmeId:undefined;
 const cool=entries.find(e=>e.type==="MATCH"&&
  ["COOL_PROGRAMME","PROGRAMME_REPETITION"].includes(e.fallout?.programmeSignal??""));
 if(cool)priorities.push({key:"cooling",eyebrow:"CREATIVE DIRECTION",
  headline:"A rivalry needs a fresh chapter",
  detail:cool.fallout?.programmeSignal==="PROGRAMME_REPETITION"?
   "The verified result flagged repetition in "+cool.headline+
   ". Consider a different angle or opposition before booking that story again.":
   cool.headline+" produced a cooling rivalry signal. Decide whether the programme needs a new direction.",
  destination:"programmes",action:"Review programmes",evidenceSlotId:cool.slotId,
  programmeId:exactProgramme(cool)});
 const hot=entries.find(e=>e.type==="MATCH"&&
  e.fallout?.programmeSignal==="HOT_PROGRAMME");
 if(hot&&!cool)priorities.push({key:"hot",eyebrow:"CREATIVE OPPORTUNITY",
  headline:"A rivalry caught fire",
  detail:hot.headline+" had a verified hot-programme signal. If you continue it, give the next chapter a purpose.",
  destination:"programmes",action:"Develop programme",evidenceSlotId:hot.slotId,
  programmeId:exactProgramme(hot)});
 if(!hot&&!cool){
  const entry=entries.find(e=>e.programmeChapters?.length===1);
  const chapter=entry?.programmeChapters?.[0];
  if(entry&&chapter)priorities.push({key:"programme",eyebrow:"PROGRAMME CHAPTER",
   headline:[chapter.sideA,chapter.sideB].filter(Boolean).join(" / "),
   detail:"The programme recorded "+(entry.type==="MATCH"?"a match":"an angle")+
    " on this show. Open its file to choose the next chapter.",
   destination:"programmes",action:"Open programme",evidenceSlotId:entry.slotId,
   programmeId:chapter.programmeId});
 }
 const strong=entries.filter(e=>e.type==="MATCH"&&
  typeof e.fallout?.ratingStars==="number"&&
  Number.isFinite(e.fallout.ratingStars)).sort((a,b)=>
   (b.fallout?.ratingStars??0)-(a.fallout?.ratingStars??0)||
   b.crowdResponse-a.crowdResponse)[0];
 const standout=strong&&strong.fallout!.ratingStars!>=4?
  strong.headline+" earned "+strong.fallout!.ratingStars!.toFixed(2)+
  " verified stars. Consider how to follow that performance, rather than repeating the same match immediately.":
  null;
 // A high-rated match belongs in the Show Breakdown and Road Agent report,
 // not a separate generic 'build on the show' decision card.
 if(show.gorillaLog?.incidents.length)
  priorities.push({key:"production",eyebrow:"PRODUCTION",
   headline:"Review curtain decisions",
   detail:show.gorillaLog.incidents.length+" production incident"+
    (show.gorillaLog.incidents.length===1?" was":"s were")+
    " recorded on this show. The saved Gorilla Log below has the evidence.",
   destination:"staff",action:"Open staff office"});
 return {actions:priorities.slice(0,3),standout};
}
