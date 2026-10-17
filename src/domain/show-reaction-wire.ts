/** Ringside Crowd Noise — deterministic editorial reactions to certified results.
 * These are explicitly generated reaction *flavour*, not sourced social posts,
 * fan identities, backstage knowledge or an alternative simulation.
 * No extra reads, paid models, writeback or current-World lookups.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";

export type ReactionVoice="THE CROWD"|"PRESS BOX"|"THE BACK ROW"|"TRADE TALK";
export type ReactionMood="BUZZ"|"DEBATE"|"CONCERN"|"COLD";
export interface ResultReaction {
 slotId:string;voice:ReactionVoice;mood:ReactionMood;
 text:string;source:"TITLE"|"MEDICAL"|"FINISH"|"CRITIC_CROWD"|
  "RIVALRY"|"ANGLE"|"MATCH";
}
type Candidate=ResultReaction&{priority:number;position:number};
function pick(lines:readonly string[],key:string,salt:number):string{
 let hash=(2166136261^salt)>>>0;
 for(const c of key){hash^=c.charCodeAt(0);hash=Math.imul(hash,16777619);}
 return lines[(hash>>>0)%lines.length]!;
}
const label=(names:readonly string[])=>names.join(" & ");
function officialWinner(entry:ShowResultEntry):string|null{
 const names=entry.matchContext?.winnerNames??[];
 return names.length?label(names):null;
}
function contender(entry:ShowResultEntry):string{
 const sides=entry.matchContext?.sides??[];
 return sides.map(s=>label(s)).join(" vs ")||
  (entry.type==="SEGMENT"?entry.headline:"this contest");
}
function candidate(entry:ShowResultEntry,showId:string):Candidate|null{
 const key=showId+":"+entry.slotId;
 const base={slotId:entry.slotId,position:entry.position};
 const f=entry.fallout;
 const winner=officialWinner(entry);
 if(entry.type==="MATCH"){
  if(f?.title?.changed){
   const t=f.title;
   return {...base,voice:"TRADE TALK",mood:"BUZZ",source:"TITLE",priority:130,
    text:pick([
     t.winnerName+" takes the "+t.name+". A change at the top, and the rest of the division has to respond.",
     "New champion, new pecking order. "+t.winnerName+" is now the name on the "+t.name+".",
     t.name+" has changed hands. The official record says "+t.winnerName+" — everything else is tomorrow's booking.",
    ],key,1)};
  }
  const injury=f?.injuries[0];
  if(injury){
   const weeks=injury.weeksOut;
   const detail=weeks===null?"The recovery period has not been confirmed.":
    "The recorded absence is "+weeks+" PPW "+(weeks===1?"week":"weeks")+".";
   return {...base,voice:"PRESS BOX",mood:"CONCERN",source:"MEDICAL",priority:116,
    text:injury.personName+" picked up a "+injury.severity.toLowerCase()+
     " injury"+(injury.stoppage?" and the referee stopped the contest":"")+
     ". "+detail};
  }
  const rating=f?.ratingStars;
  if(rating!==undefined&&rating>=3.75&&entry.crowdResponse<50){
   return {...base,voice:"PRESS BOX",mood:"DEBATE",source:"CRITIC_CROWD",priority:101,
    text:pick([
     rating.toFixed(2)+" stars in the ring, but only "+entry.crowdResponse.toFixed(1)+
      " from the crowd. Someone has to explain that gap.",
     "The critical score says quality. The audience score says otherwise. "+
      contender(entry)+" divided the room.",
    ],key,2)};
  }
  if(rating!==undefined&&rating<2.5&&entry.crowdResponse>=78){
   return {...base,voice:"THE BACK ROW",mood:"DEBATE",source:"CRITIC_CROWD",priority:99,
    text:pick([
     "The critics might not call "+contender(entry)+" a classic, but that crowd had a ball.",
     "A modest "+rating.toFixed(2)+"-star rating and a huge crowd response? "+
      "Sometimes the crowd just wants a good time.",
    ],key,3)};
  }
  if(entry.outcome==="DISQUALIFICATION"||entry.outcome==="FOREIGN_OBJECT"){
   const cheater=f?.finishCheaterName;
   const detail=entry.outcome==="DISQUALIFICATION"?
    "the referee disqualified the offending side":
    "a foreign object decided the contest";
   return {...base,voice:"THE BACK ROW",mood:"DEBATE",source:"FINISH",priority:94,
    text:(cheater?cheater+" is going to hear about that one. ":"Not exactly a clean finish. ")+
     "The official result records "+detail+
     (winner?", with "+winner+" victorious.":".")};
  }
  if(f?.interference?.outcome==="SUCCESS"){
   return {...base,voice:"TRADE TALK",mood:"DEBATE",source:"FINISH",priority:91,
    text:"The run-in was recorded as successful in "+contender(entry)+
     ". That is a protected finish, not a clean sporting decision."};
  }
  if(f?.programmeSignal==="PROGRAMME_REPETITION"&&f.linkedProgrammes){
   return {...base,voice:"PRESS BOX",mood:"DEBATE",source:"RIVALRY",priority:87,
    text:"The "+(f.linkedProgrammes===1?"rivalry was":"rivalries were")+
     " part of the booking, but repetition dragged on the crowd response. "+
     "The next chapter needs to earn its place."};
  }
  if(f?.programmeSignal==="HOT_PROGRAMME"&&f.linkedProgrammes&&entry.crowdResponse>=65){
   return {...base,voice:"TRADE TALK",mood:"BUZZ",source:"RIVALRY",priority:83,
    text:"A hot programme gave "+contender(entry)+
     " some welcome heat. That's a storyline doing its job."};
  }
  if(rating!==undefined&&rating>=4.25){
   return {...base,voice:"PRESS BOX",mood:"BUZZ",source:"MATCH",priority:82,
    text:pick([
     "A "+rating.toFixed(2)+"-star contest. "+contender(entry)+
      " has put down a marker for the match-of-the-year conversation.",
     "That is "+rating.toFixed(2)+" stars for "+contender(entry)+
      ". No imaginary play-by-play needed — the work scored for itself.",
    ],key,4)};
  }
  if(entry.crowdResponse>=82){
   return {...base,voice:"THE CROWD",mood:"BUZZ",source:"MATCH",priority:73,
    text:pick([
     "The building was loud for "+contender(entry)+". That is the reaction you book for.",
     contender(entry)+" got the crowd going. Whatever the critical rating, the audience was there.",
    ],key,5)};
  }
  if(entry.crowdResponse<42){
   return {...base,voice:"THE BACK ROW",mood:"COLD",source:"MATCH",priority:63,
    text:pick([
     "The crowd was a tough sell during "+contender(entry)+
      ". It never got the reaction the booker wanted.",
     "You could hear the quiet. "+contender(entry)+" struggled to connect.",
    ],key,6)};
  }
  return null;
 }
 if(entry.outcome==="REFUSED"||entry.outcome==="INTERRUPTED"){
  return {...base,voice:"PRESS BOX",mood:"DEBATE",source:"ANGLE",priority:85,
   text:entry.outcome==="REFUSED"?
    "The planned "+(entry.segmentKind??"angle").toLowerCase().replaceAll("_"," ")+
     " was refused. Whatever was advertised, that moment was not performed.":
    "The "+(entry.segmentKind??"angle").toLowerCase().replaceAll("_"," ")+
     " was interrupted before its planned outcome. The original booking is not the completed story."};
 }
 if(entry.outcome!=="HAPPENS")return null;
 if(entry.intent==="TURN_OCCURRED"){
  return {...base,voice:"THE CROWD",mood:"BUZZ",source:"ANGLE",priority:108,
   text:"A turn actually took place tonight. "+entry.headline+
    " — and the promotion now owns the follow-through."};
 }
 if(entry.intent==="DEBUT_OCCURRED"){
  return {...base,voice:"THE BACK ROW",mood:"BUZZ",source:"ANGLE",priority:104,
   text:"Now THAT is an entrance. The scheduled debut happened, and "+
    "the response scored "+entry.crowdResponse.toFixed(1)+"/100."};
 }
 if(entry.crowdResponse>=84){
  return {...base,voice:"THE CROWD",mood:"BUZZ",source:"ANGLE",priority:76,
   text:pick([
    "That "+(entry.segmentKind??"angle").toLowerCase().replaceAll("_"," ")+
     " really landed. The crowd score says it all.",
    "A proper crowd-pleaser of a segment. The audience didn't stay quiet.",
   ],key,7)};
 }
 if(entry.crowdResponse<40){
  return {...base,voice:"THE BACK ROW",mood:"COLD",source:"ANGLE",priority:58,
   text:"The "+(entry.segmentKind??"angle").toLowerCase().replaceAll("_"," ")+
    " was performed, but the crowd was not having it."};
 }
 return null;
}
/** Most important distinct *recorded* slots; no synthetic accounts, no polling.
 * Caller can click the source slot in the already-loaded broadcast.
 */
export function showReactionWire(
 show:CompletedShowView,limit=4,
):ResultReaction[]{
 if(!Number.isSafeInteger(limit)||limit<0||limit>8)
  throw new Error("Invalid Ringside reaction limit");
 if(limit===0)return [];
 const candidates=show.entries.flatMap(entry=>{
  const story=candidate(entry,show.showId);
  return story?[story]:[];
 });
 return candidates.sort((a,b)=>b.priority-a.priority||a.position-b.position||
  a.slotId.localeCompare(b.slotId)).slice(0,limit)
  .map(({priority:_priority,position:_position,...reaction})=>reaction);
}
