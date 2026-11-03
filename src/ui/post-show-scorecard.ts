/** Pure, compact post-show facts from the one certified completed-show payload.
 * Historical evidence only: never infer current booking clearance or cash.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
export interface PostShowSpotlight{
 headline:string;slotId:string;value:number;
}
export interface PostShowScorecard{
 bestMatch:PostShowSpotlight|null;
 lowestRatedMatch:PostShowSpotlight|null;
 crowdPeak:PostShowSpotlight|null;
 crowdLow:PostShowSpotlight|null;
 medical:{name:string;weeksOut:number}[];
 titleChanges:{name:string;winner:string}[];
}
export function projectPostShowScorecard(show:CompletedShowView):PostShowScorecard{
 const rated=show.entries.filter((e):e is ShowResultEntry & {
  fallout:NonNullable<ShowResultEntry["fallout"]>
 }=>e.type==="MATCH"&&typeof e.fallout?.ratingStars==="number"&&
  Number.isFinite(e.fallout.ratingStars));
 const ordered=[...rated].sort((a,b)=>
  b.fallout.ratingStars!-a.fallout.ratingStars!||a.position-b.position);
 const spotlight=(entry:ShowResultEntry,value:number):PostShowSpotlight=>
  ({headline:entry.headline,slotId:entry.slotId,value});
 const crowd=[...show.entries].filter(e=>Number.isFinite(e.crowdResponse))
  .sort((a,b)=>b.crowdResponse-a.crowdResponse||a.position-b.position);
 const medical=new Map<string,number>();
 const titleChanges:{name:string;winner:string}[]=[];
 for(const entry of show.entries){
  for(const injury of entry.fallout?.injuries??[]){
   if(!injury.personName.trim())continue;
   medical.set(injury.personName,Math.max(injury.weeksOut,
    medical.get(injury.personName)??0));
  }
  const title=entry.fallout?.title;
  if(title?.changed)titleChanges.push({name:title.name,winner:title.winnerName});
 }
 return {
  bestMatch:ordered.length?
   spotlight(ordered[0]!,ordered[0]!.fallout.ratingStars!):null,
  lowestRatedMatch:ordered.length>1?
   spotlight(ordered[ordered.length-1]!,ordered[ordered.length-1]!.fallout.ratingStars!):null,
  crowdPeak:crowd.length>1?spotlight(crowd[0]!,crowd[0]!.crowdResponse):null,
  crowdLow:crowd.length>1?spotlight(crowd[crowd.length-1]!,
   crowd[crowd.length-1]!.crowdResponse):null,
  medical:[...medical].map(([name,weeksOut])=>({name,weeksOut})),
  titleChanges,
 };
}
