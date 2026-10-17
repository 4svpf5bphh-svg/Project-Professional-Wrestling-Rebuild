
/** Original PPW broadcast principle: top two actual recorded highlights,
 * no invented action and no repeated slot in the opening.
 * Works entirely on the four-read completed result view.
 */
import type {ShowResultEntry} from "../db/show-results-view.js";
export interface BroadcastHighlight{
 slotId:string;position:number;category:"CHAMPIONSHIP"|"INJURY"|"TURN"|"ARRIVAL"|"ATTACK"|"MATCH"|"ANGLE";
 headline:string;detail:string;
}
type Rated=BroadcastHighlight&{priority:number};
export function showBroadcastHighlights(
 entries:readonly ShowResultEntry[],limit=2,
):BroadcastHighlight[]{
 if(!Number.isSafeInteger(limit)||limit<0||limit>5)throw new Error("Invalid broadcast highlight limit");
 const candidates:Rated[]=[];
 let strongest:ShowResultEntry|undefined;
 let strongestScore=-1;
 for(const entry of entries){
  if(entry.type==="MATCH"){
   // A rated match is chosen by the simulation's critical score, not
   // the potentially contradictory audience reaction. Legacy receipts use
   // audience score until there is a persisted critic rating.
   const score=entry.fallout?.ratingStars===undefined?
    entry.crowdResponse/20:entry.fallout.ratingStars;
   if(score>strongestScore){strongest=entry;strongestScore=score;}
   if(entry.fallout?.title?.changed){
    const t=entry.fallout.title;
    candidates.push({slotId:entry.slotId,position:entry.position,priority:110,
     category:"CHAMPIONSHIP",headline:"A new champion is crowned",
     detail:t.winnerName+" captures "+t.name+
      (t.priorHolderName?" from "+t.priorHolderName:"")});
   }
   if(entry.fallout?.injuries.length){
    const injured=entry.fallout.injuries.map(x=>x.personName).join(" & ");
    candidates.push({slotId:entry.slotId,position:entry.position,priority:99,
     category:"INJURY",headline:"Medical news from ringside",
     detail:injured+" — "+entry.fallout.injuries.map(x=>
      x.severity.toLowerCase()+" injury").join(", ")});
   }
   continue;
  }
  // A refusal is an authored event, but never a successful attack,
  // debut or turn. Highlighting it as such would rewrite the player's story.
  if(entry.outcome!=="HAPPENS")continue;
  const intent=entry.intent??"";
  if(intent==="TURN_OCCURRED")
   candidates.push({slotId:entry.slotId,position:entry.position,priority:100,
    category:"TURN",headline:"A dramatic turn",detail:entry.summary});
  else if(intent==="DEBUT_OCCURRED")
   candidates.push({slotId:entry.slotId,position:entry.position,priority:96,
    category:"ARRIVAL",headline:"A new arrival",detail:entry.summary});
  else if(intent==="ATTACK_OCCURRED")
   candidates.push({slotId:entry.slotId,position:entry.position,priority:82,
    category:"ATTACK",headline:"A backstage ambush",detail:entry.summary});
  else if(entry.crowdResponse>=80)
   candidates.push({slotId:entry.slotId,position:entry.position,priority:65,
    category:"ANGLE",headline:entry.headline,detail:entry.summary});
 }
 if(strongest)
  candidates.push({slotId:strongest.slotId,position:strongest.position,
   category:"MATCH",priority:strongest.crowdResponse>=75?86:55,
   headline:strongest.fallout?.ratingStars!==undefined?
    "Top-rated match":strongest.crowdResponse>=75?
     "Match of the night":"Tonight's standout match",
   detail:(strongest.fallout?.ratingStars===undefined?"":("★ "+
    strongest.fallout.ratingStars.toFixed(2)+" · "))+strongest.headline});
 const used=new Set<string>();
 return candidates.sort((a,b)=>b.priority-a.priority||a.position-b.position)
  .filter(c=>{if(used.has(c.slotId))return false;used.add(c.slotId);return true;})
  .slice(0,limit).map(({priority:_priority,...item})=>item);
}
