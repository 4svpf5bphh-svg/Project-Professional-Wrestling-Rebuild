/** Ringside Crowd Noise — deterministic editorial reactions to certified results.
 * These are explicitly generated reaction *flavour*, not sourced social posts,
 * fan identities, backstage knowledge or an alternative simulation.
 * No extra reads, paid models, writeback or current-World lookups.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";

export type ReactionVoice="THE FRONT ROW"|"THE SKEPTICAL SMARK"|"THE TAPE TRADER"|
 "THE DIEHARD"|"THE HEEL DEFENDER"|"THE CONCERNED FAN"|"THE RIVALRY ADDICT"|"THE BACK ROW";
export type ReactionMood="BUZZ"|"DEBATE"|"CONCERN"|"COLD";
export interface ResultReaction {
 slotId:string;voice:ReactionVoice;mood:ReactionMood;
 text:string;reply?:{voice:ReactionVoice;text:string};
 source:"TITLE"|"MEDICAL"|"FINISH"|"CRITIC_CROWD"|
  "RIVALRY"|"ELIMINATION"|"ANGLE"|"MATCH";
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
 const f=entry.fallout, winner=officialWinner(entry),bout=contender(entry);
 if(entry.type==="MATCH"){
  if(f?.title?.changed){
   return {...base,voice:"THE FRONT ROW",mood:"BUZZ",source:"TITLE",priority:130,
    text:pick([
     f.title.winnerName+" is the new "+f.title.name+" champion. My voice is gone, and I'm sending them the bill for it.",
     f.title.winnerName+" with the "+f.title.name+"? The division suddenly looks a whole lot more interesting.",
     "That belt really has changed hands. "+f.title.winnerName+" takes the "+f.title.name+" — and everybody else has homework.",
    ],key,1),
    reply:{voice:"THE SKEPTICAL SMARK",
     text:"Good moment for "+f.title.winnerName+". Let's see what that reign looks like once the celebrating stops."}};
  }
  const injury=f?.injuries[0];
  if(injury)return {...base,voice:"THE CONCERNED FAN",mood:"CONCERN",source:"MEDICAL",priority:116,
   text:injury.personName+" was hurt"+
    (injury.stoppage?" badly enough for the referee to stop it":" during that match")+
    ". Forget the arguments about the result — hoping they're all right."};
  const rating=f?.ratingStars;
  if(rating!==undefined&&rating>=3.75&&entry.crowdResponse<50)
   return {...base,voice:"THE TAPE TRADER",mood:"DEBATE",source:"CRITIC_CROWD",priority:101,
    text:pick([
     bout+" had the technique, but the room never went with it. Great wrestling doesn't guarantee great theatre.",
     "I liked the work in "+bout+". The quiet crowd? That's the bit the critics can't hand-wave away.",
    ],key,2),
    reply:{voice:"THE DIEHARD",
     text:"I paid to feel something, not sit an exam. If the audience was quiet, the match still had a problem."}};
  if(rating!==undefined&&rating<2.5&&entry.crowdResponse>=78)
   return {...base,voice:"THE DIEHARD",mood:"DEBATE",source:"CRITIC_CROWD",priority:99,
    text:pick([
     "The critics can keep their notebooks. "+bout+" had that building losing its mind.",
     bout+" wasn't a technical masterpiece and I don't care. Sometimes wrestling is just ridiculous fun.",
    ],key,3),
    reply:{voice:"THE TAPE TRADER",
     text:"Being popular and being well worked aren't the same thing. I can enjoy the noise and still want a better match."}};
  if(entry.outcome==="OVER_THE_TOP_ROPE"&&f?.eliminations.length){
   const last=f.eliminations.at(-1)!;
   return {...base,voice:"THE FRONT ROW",mood:"BUZZ",source:"ELIMINATION",priority:97,
    text:last+" went out, "+(winner??"the winner")+" finished on top. I need to see that final stretch again."};
  }
  if(entry.outcome==="DISQUALIFICATION"||entry.outcome==="FOREIGN_OBJECT")
   return {...base,voice:"THE HEEL DEFENDER",mood:"DEBATE",source:"FINISH",priority:94,
    text:(f?.finishCheaterName?f.finishCheaterName+" knew exactly what they were doing. ":"Call it dirty if you want. ")+
     (winner?winner+" got the win. ":"")+
     "I'm not saying it was fair. I'm saying the argument is half the fun.",
    reply:{voice:"THE SKEPTICAL SMARK",
     text:"The result is official. Doesn't mean I have to applaud the way they got there."}};
  if(f?.interference?.outcome==="SUCCESS")
   return {...base,voice:"THE SKEPTICAL SMARK",mood:"DEBATE",source:"FINISH",priority:91,
    text:"A run-in changed the complexion of "+bout+". Next week someone had better have something to say about that."};
  if(f?.programmeSignal==="PROGRAMME_REPETITION"&&f.linkedProgrammes)
   return {...base,voice:"THE SKEPTICAL SMARK",mood:"DEBATE",source:"RIVALRY",priority:87,
    text:"Even a good feud needs a new chapter. "+bout+" is getting awfully familiar. Repetition isn't heat."};
  if(f?.programmeSignal==="HOT_PROGRAMME"&&f.linkedProgrammes&&entry.crowdResponse>=65)
   return {...base,voice:"THE RIVALRY ADDICT",mood:"BUZZ",source:"RIVALRY",priority:83,
    text:"That's the kind of heat that makes a rivalry feel alive. "+bout+" has me invested in what comes next."};
  if(rating!==undefined&&rating>=4.25)
   return {...base,voice:"THE TAPE TRADER",mood:"BUZZ",source:"MATCH",priority:82,
    text:pick([
     bout+" was the kind of wrestling worth clearing an evening for. I already want the rematch.",
     "The little things in "+bout+" were terrific. Wrestling rewards people who actually watch it.",
    ],key,4)};
  if(entry.outcome==="SUBMISSION"&&entry.crowdResponse>=65)
   return {...base,voice:"THE FRONT ROW",mood:"BUZZ",source:"FINISH",priority:80,
    text:(winner??"The winner")+" forced the submission, and the place came unglued. Sometimes a tap-out says everything."};
  if(entry.outcome==="FLASH_PIN"&&entry.crowdResponse>=65)
   return {...base,voice:"THE SKEPTICAL SMARK",mood:"DEBATE",source:"FINISH",priority:80,
    text:"A flash pin in "+bout+"? Blink and you've missed it. The losing side is going to hate that one."};
  if(entry.crowdResponse>=82)
   return {...base,voice:"THE FRONT ROW",mood:"BUZZ",source:"MATCH",priority:73,
    text:pick([
     "The noise during "+bout+" was unreal. I could barely hear myself complain, which is saying something.",
     bout+" had the whole building on its feet. That's why we buy tickets.",
    ],key,5)};
  if(entry.crowdResponse<42)
   return {...base,voice:"THE BACK ROW",mood:"COLD",source:"MATCH",priority:63,
    text:pick([
     "We wanted to care about "+bout+". It never quite hooked the room.",
     "Bit of a long night for "+bout+". Even the hecklers were running low on material.",
    ],key,6)};
  return {...base,voice:"THE BACK ROW",mood:"DEBATE",source:"MATCH",priority:20,
   text:"Still thinking about "+bout+". There's always one match that divides the car ride home."};
 }
 if(entry.outcome==="REFUSED"||entry.outcome==="INTERRUPTED")
  return {...base,voice:"THE SKEPTICAL SMARK",mood:"DEBATE",source:"ANGLE",priority:85,
   text:entry.outcome==="REFUSED"?
    "That "+(entry.segmentKind??"angle").toLowerCase().replaceAll("_"," ")+" was refused. That's quite an awkward silence to leave hanging.":
    "The "+(entry.segmentKind??"angle").toLowerCase().replaceAll("_"," ")+" was interrupted. Someone definitely owes us a follow-up."};
 if(entry.outcome!=="HAPPENS")return null;
 if(entry.intent==="TURN_OCCURRED")
  return {...base,voice:"THE FRONT ROW",mood:"BUZZ",source:"ANGLE",priority:108,
   text:"That turn! "+entry.headline+". I saw the warning signs and still got caught out.",
   reply:{voice:"THE HEEL DEFENDER",
    text:"Call it betrayal if you want. I want to see what they do now the mask is off."}};
 if(entry.intent==="DEBUT_OCCURRED")
  return {...base,voice:"THE DIEHARD",mood:"BUZZ",source:"ANGLE",priority:104,
   text:"A debut worth getting out of your seat for. "+entry.headline+". Now give them something worth doing.",
   reply:{voice:"THE SKEPTICAL SMARK",
    text:"A grand entrance is one night. I'm more interested in the first real rivalry."}};
 if(entry.crowdResponse>=84)
  return {...base,voice:"THE FRONT ROW",mood:"BUZZ",source:"ANGLE",priority:76,
   text:"That "+(entry.segmentKind??"segment").toLowerCase().replaceAll("_"," ")+" really landed. The reactions were half the show."};
 if(entry.crowdResponse<40)
  return {...base,voice:"THE SKEPTICAL SMARK",mood:"COLD",source:"ANGLE",priority:58,
   text:"Not every idea needs another week of airtime. That "+(entry.segmentKind??"segment").toLowerCase().replaceAll("_"," ")+" struggled."};
 return {...base,voice:"THE BACK ROW",mood:"DEBATE",source:"ANGLE",priority:18,
  text:entry.headline+". Half our row loved it, half hated it. That's wrestling for you."};
}
/** The feed is fictional but the personalities shouldn't be interchangeable.
 * Only revisit the original certified match when adapting a generic reaction.
 * Never invent a move, an injury, an actual fan eyewitness or a new outcome.
 */
function fanVoiceForGenericMatch(
 voice:ReactionVoice,mood:ReactionMood,entry:ShowResultEntry,
):string|null{
 const bout=contender(entry);
 if(mood==="BUZZ"){
  const lines:Record<ReactionVoice,string>={
   "THE FRONT ROW":"The noise for "+bout+" was extraordinary. That's why people love live wrestling.",
   "THE SKEPTICAL SMARK":"I came ready to nitpick "+bout+", but that crowd reaction was difficult to argue with.",
   "THE TAPE TRADER":"That building got behind "+bout+". I'll be watching the match again to see how it holds up.",
   "THE DIEHARD":"Give me nights like "+bout+" every week. The reaction was ridiculous.",
   "THE HEEL DEFENDER":"Love the result or hate it, "+bout+" absolutely had the room.",
   "THE CONCERNED FAN":"That was a passionate crowd for "+bout+". Here's hoping the wrestlers keep that momentum.",
   "THE RIVALRY ADDICT":"The reaction to "+bout+" was huge. Now give me a reason to care about what happens next.",
   "THE BACK ROW":"I thought "+bout+" might split the room. Instead, everyone sounded invested."
  };
  return lines[voice];
 }
 if(mood==="COLD"){
  const lines:Partial<Record<ReactionVoice,string>>={
   "THE BACK ROW":"The room never really came along for "+bout+". There was a lot of work left to do.",
   "THE DIEHARD":"I wanted to get into "+bout+", honestly. That crowd never found its way in.",
   "THE SKEPTICAL SMARK":"Not much heat for "+bout+". You can't argue an audience into caring.",
   "THE TAPE TRADER":"I'll revisit "+bout+" on tape, but the response in the building was quiet."
  };
  return lines[voice]??null;
 }
 if(mood==="DEBATE"){
  const lines:Partial<Record<ReactionVoice,string>>={
   "THE BACK ROW":"I'm still making up my mind about "+bout+". That one divided the discussion on the way home.",
   "THE SKEPTICAL SMARK":"Not convinced "+bout+" settled the argument. People will be picking it apart.",
   "THE TAPE TRADER":"Put "+bout+" on the watch-again list. There's more to discuss than the first impression.",
   "THE DIEHARD":"I know people disagree about "+bout+". That's half the reason I love wrestling."
  };
  return lines[voice]??null;
 }
 return null;
}
/** Most important distinct *recorded* slots; no synthetic accounts, no polling.
 * Caller can click the source slot in the already-loaded broadcast.
 */
export function showReactionWire(
 show:CompletedShowView,limit=5,
):ResultReaction[]{
 if(!Number.isSafeInteger(limit)||limit<0||limit>8)
  throw new Error("Invalid Ringside reaction limit");
 if(limit===0)return [];
 const candidates=show.entries.flatMap(entry=>{
  const story=candidate(entry,show.showId);
  return story?[story]:[];
 });
 const selected=candidates.sort((a,b)=>b.priority-a.priority||a.position-b.position||
  a.slotId.localeCompare(b.slotId)).slice(0,limit);
 // Diverse fictional perspectives, still sourced from the same certified slots.
 const used=new Set<ReactionVoice>();
 const voices:readonly ReactionVoice[]=["THE BACK ROW","THE DIEHARD","THE TAPE TRADER",
  "THE SKEPTICAL SMARK","THE FRONT ROW","THE RIVALRY ADDICT",
  "THE HEEL DEFENDER","THE CONCERNED FAN"];
 return selected.map(({priority:_priority,position:_position,...reaction})=>{
  if(used.has(reaction.voice)){
   const replacement=voices.find(v=>!used.has(v)&&v!==reaction.reply?.voice&&
    (reaction.mood!=="CONCERN"||v==="THE CONCERNED FAN"));
   if(replacement){
    // The same generic text assigned to five unrelated voices is robotic.
    // Rephrase only when the certified evidence supports that voice.
    if(reaction.source==="MATCH"){
     const entry=show.entries.find(e=>e.slotId===reaction.slotId);
     const copy=entry&&fanVoiceForGenericMatch(replacement,reaction.mood,entry);
     if(copy){reaction.voice=replacement;reaction.text=copy;}
    }else{
     // A title change, injury or other major event has its own natural
     // speaker: keep that speaker instead of relabelling a specific opinion.
    }
   }
  }
  used.add(reaction.voice);
  return reaction;
 });
}
