/** Concise, player-readable projection of the same immutable certified show.
 * No new database reads and no inferred finishes, ratings or consequences.
 */
import type {ShowResultEntry} from "../db/show-results-view.js";
export interface BreakdownItem{
 slotId:string;position:number;kind:"MATCH"|"ANGLE";headline:string;
 participants:string;winner:string|null;stars:number|null;crowd:number;
 minutes:number|null;finish:string;keyMoments:string[];
}
const words=(value:string)=>value.replaceAll("_"," ").toLowerCase()
 .replace(/(^|\s)\S/g,c=>c.toUpperCase());
export function projectShowBreakdown(entries:readonly ShowResultEntry[]):BreakdownItem[]{
 return entries.map(entry=>{
  const match=entry.type==="MATCH";
  const participants=match?
   (entry.matchContext?.sides.map(team=>team.join(" & ")).join(" vs ")??entry.headline):
   [...(entry.segmentContext?.actorNames??[]),...(entry.segmentContext?.targetNames??[])]
    .join(" · ")||entry.headline;
  const fallout=entry.fallout;
  const keyMoments:string[]=[];
  if(fallout?.title?.changed)keyMoments.push("New champion: "+fallout.title.winnerName);
  if(fallout?.interference)keyMoments.push("Interference: "+words(fallout.interference.outcome));
  if(fallout?.injuries.length)keyMoments.push("Medical update: "+
   fallout.injuries.map(x=>x.personName).join(", "));
  if(fallout?.programmeSignal==="HOT_PROGRAMME")keyMoments.push("Rivalry momentum rose");
  if(fallout?.programmeSignal==="COOL_PROGRAMME")keyMoments.push("Rivalry momentum cooled");
  return {slotId:entry.slotId,position:entry.position,kind:match?"MATCH":"ANGLE",
   headline:entry.headline,participants,
   winner:match&&entry.matchContext?.winnerNames.length?
    entry.matchContext.winnerNames.join(" & "):null,
   stars:typeof fallout?.ratingStars==="number"?fallout.ratingStars:null,
   crowd:entry.crowdResponse,
   minutes:typeof fallout?.actualMinutes==="number"?fallout.actualMinutes:null,
   finish:words(entry.outcome),keyMoments};
 });
}
