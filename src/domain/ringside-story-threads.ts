/** Small, slot-specific certified history for Ringside editorial.
 * No inference from heat, no future developments, no requests to a model.
 * Any claim of a previous match is based on two current participants sharing
 * a historical certified card, not merely appearing in the same promotion.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import type {RingsideMemory} from "../db/ringside-continuity.js";

export interface RingsideStoryThread{
 rivalry?:{
  pairing:string;previousMatches:number;previousAngles:number;
  lastMatch:string|null;lastWinner:string|null;
 };
 previousSharedMatch?:{when:string;winner:string|null;finish:string};
 earlierOnThisCard?:{card:number;kind:"MATCH"|"SEGMENT"};
}
const name=(v:string)=>v.trim().slice(0,160);
const same=(a:string,b:string)=>name(a).toLocaleLowerCase("en-US")===
 name(b).toLocaleLowerCase("en-US");
const priorWeek=(i:number)=>"Year "+(Math.floor(i/52)+1)+", Week "+(i%52+1);
function currentOppositeSides(entry:ShowResultEntry):string[][]{
 if(entry.type==="MATCH")return (entry.matchContext?.sides??[]).map(x=>x.map(name));
 const ctx=entry.segmentContext;
 return ctx?[ctx.actorNames.map(name),ctx.targetNames.map(name)]:[];
}
function sameOpposingPair(entry:ShowResultEntry,participants:readonly string[]){
 const sides=currentOppositeSides(entry);
 if(sides.length<2)return false;
 const hits=sides.map(side=>side.some(n=>participants.some(p=>same(n,p))));
 return hits.filter(Boolean).length>=2;
}
export function verifiedSlotStoryThreads(
 show:CompletedShowView,memory:RingsideMemory,
):Array<RingsideStoryThread|null>{
 const used=new Map<string,{card:number;kind:"MATCH"|"SEGMENT"}>();
 const result:Array<RingsideStoryThread|null>=[];
 for(const [index,entry] of show.entries.entries()){
  const chapter=entry.programmeChapters?.[0];
  const prev=chapter?used.get(chapter.programmeId):undefined;
  const thread:RingsideStoryThread={};
  if(chapter){
   const lastWinner=chapter.previousWinner==="A"?name(chapter.sideA):
    chapter.previousWinner==="B"?name(chapter.sideB):null;
   thread.rivalry={
    pairing:name(chapter.sideA)+" vs "+name(chapter.sideB),
    previousMatches:chapter.precedingMatches,
    previousAngles:chapter.precedingAngles,
    lastMatch:chapter.previousMatchWeek===null?null:
     priorWeek(chapter.previousMatchWeek),
    lastWinner
   };
   if(prev)thread.earlierOnThisCard=prev;
  }
  // The old history feed is deliberately unlinked. It can show a shared
  // match only when BOTH sides of this current encounter are represented.
  // That is not evidence of a feud or of a previous head-to-head result.
  if(!chapter||chapter.precedingMatches===0){
   const previous=memory.priorMatches.find(x=>
    sameOpposingPair(entry,x.wrestlers)&&
    x.wrestlers.length<=12&&x.winners.length<=6);
   if(previous){
    thread.previousSharedMatch={
     when:name(previous.when),
     winner:previous.winners.length===1?name(previous.winners[0]!):null,
     finish:name(previous.finish)
    };
   }
  }
  result.push(Object.keys(thread).length?thread:null);
  // Only a *certified* programme link can join chapters within this
  // broadcast. An unrelated promo never becomes storyline evidence.
  for(const link of entry.programmeChapters??[]){
   used.set(link.programmeId,{card:index+1,kind:entry.type});
  }
 }
 return result;
}
