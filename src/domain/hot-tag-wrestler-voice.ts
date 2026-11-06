/** Public, in-character HOT TAG voices from certified wrestling receipts.
 * This is presentation of existing evidence, not wrestler-authored messages,
 * Backstage disclosure, a new incident or a simulation modifier.
 * Re-opening a completed show or published article yields identical posts.
 */
import type {CompletedShowView} from "../db/show-results-view.js";
import type {HotTagNewsStory} from "./hot-tag-news.js";
import {stableHotTagHash} from "./hot-tag-news.js";

export interface HotTagWrestlerPost {
 personId:string;displayName:string;handle:string;avatar:"🎤";
 text:string;slotId:string;origin:"SHOW"|"NEWS";
 likes:number;replies:number;reposts:number;
}
export interface VerifiedHotTagAward {
 year:number;week:number;kind:"MATCH"|"ANGLE";
 promotionId:string;showId:string;slotId:string;
 personIds:readonly string[];peopleNames:readonly string[];
}
type Candidate={post:HotTagWrestlerPost;priority:number;position:number};
const validId=(id:unknown):id is string=>
 typeof id==="string"&&id.length>0&&id.length<=200;
const validName=(name:unknown):name is string=>
 typeof name==="string"&&name.trim().length>0&&name.length<=160;
const choose=(key:string,lines:readonly string[])=>
 lines[stableHotTagHash(key)%lines.length]!;
function identity(personId:string,name:string){
 const slug=name.normalize("NFKD").replace(/[^a-zA-Z0-9]/g,"").slice(0,17)||"Wrestler";
 return "@"+slug+stableHotTagHash(personId).toString(36).slice(0,4);
}
function post(personId:string,name:string,slotId:string,origin:"SHOW"|"NEWS",
 key:string,lines:readonly string[]):HotTagWrestlerPost{
 const seed=stableHotTagHash(key+":"+personId);
 return {personId,displayName:name,handle:identity(personId,name),avatar:"🎤",
  slotId,origin,text:choose(key+":"+personId,lines),
  likes:90+seed%2150,replies:6+(seed>>>7)%205,reposts:3+(seed>>>13)%270};
}
function opponentText(name:string|undefined){
 return validName(name)?" "+name.trim()+", you know where to find me.":"";
}
/** Important completed moments only: never compose a voice from an
 * unplayed segment, an ambiguous winner or an unconfirmed news story.
 * Three posts maximum per show, and never more than one per wrestler.
 */
export function projectHotTagShowWrestlerPosts(show:CompletedShowView):HotTagWrestlerPost[]{
 const candidates:Candidate[]=[];
 for(const e of show.entries){
  if(e.type==="MATCH"){
   const match=e.matchContext;
   if(!match?.sideParticipants?.length||!match.winnerNames.length)continue;
   const winnerSides=match.sideParticipants.filter(side=>
    side.length===match.winnerNames.length&&
    side.every(p=>match.winnerNames.includes(p.name)));
   if(winnerSides.length!==1)continue;
   const winningSide=winnerSides[0]!;
   const speaker=winningSide[0];
   if(!speaker||!validId(speaker.personId)||!validName(speaker.name))continue;
   const alias=e.performerIdentities?.find(p=>p.personId===speaker.personId)?.ringName;
   const name=validName(alias)?alias:speaker.name;
   const team=winningSide.length>1;
   const opponent=match.sideParticipants.length===2&&
    match.sideParticipants.find(side=>side!==winningSide)?.length===1?
    match.sideParticipants.find(side=>side!==winningSide)?.[0]?.name:undefined;
   const lines=team?[
    "We earned that result together. The bell doesn't lie.",
    "Everyone saw what our team did tonight. That's how you make a statement.",
    "A team wins and loses together. Tonight we got the win. Onto the next fight.",
    "Talk about the finish all you want. Our name is in the results."
   ]:match.championshipContested?[
    "Championship matches demand everything. I got the result tonight.",
    "A title was at stake. I stepped up when the bell rang.",
    "You don't get many nights like that. I made this one count.",
    "The record will show who got the decision. I worked for it."
   ]:[
    "The bell rang, we fought, and I got the decision."+opponentText(opponent),
    "Winning is the easy part to post about. Earning it in the ring is another story.",
    "The replay is there for everybody. I know what I did when the bell rang.",
    "A good opponent pushes you. Tonight the result went my way.",
    "I'm not asking anybody to agree with the result. Just watch the match."
   ];
   const key=show.showId+":"+e.slotId+":WIN";
   candidates.push({post:post(speaker.personId,name,e.slotId,"SHOW",key,lines),
    position:e.position,priority:match.championshipContested?94:
     match.isMainEvent?79:e.crowdResponse>=80?70:42});
   continue;
  }
  if(e.type!=="SEGMENT"||e.outcome!=="HAPPENS")continue;
  const kind=e.segmentKind??"";
  const priority:Record<string,number>={TURN:100,STABLE_EXIT:93,
   POST_MATCH_ASSAULT:92,ATTACK:90,CHALLENGE:86,RESCUE:83,
   CONFRONTATION:75,DEBUT:70,STABLE_INVITATION:67};
  if(!(kind in priority))continue;
  const personId=e.actorIds[0],actorName=e.segmentContext?.actorNames[0];
  if(!validId(personId)||!validName(actorName))continue;
  const alias=e.performerIdentities?.find(p=>p.personId===personId)?.ringName;
  const name=validName(alias)?alias:actorName;
  const target=e.segmentContext?.targetNames[0];
  const targetLine=validName(target)?" "+target.trim()+", your move.":"";
  const lines:Record<string,string[]>={
   TURN:["Everybody saw where I stand. I'm not taking it back.",
    "I made my choice out there. People can deal with it.",
    "Some of you looked surprised. I wasn't."],
   STABLE_EXIT:["Some chapters end in front of everyone. You saw this one.",
    "Whatever comes next, I made my decision out there.",
    "You saw the parting of ways. I have nothing to hide about that."],
   POST_MATCH_ASSAULT:["The bell didn't end the message I wanted to send.",
    "I made my point after the match. The reaction tells me it landed.",
    "You saw what I did. The next move isn't mine to make."],
   ATTACK:["The message wasn't subtle. It wasn't meant to be.",
    "I did what I did in front of everyone. Now we see what happens.",
    "We can settle this in the ring. You know where to find me."],
   CHALLENGE:["I said it in front of everybody."+targetLine,
    "The challenge is out there. I'm waiting for an answer.",
    "I asked for the fight. Now let's see who responds."],
   RESCUE:["I wasn't going to stand there and watch. You saw the rest.",
    "Sometimes you have to step in. Tonight was one of those times.",
    "What happened out there mattered. I'd do it again."],
   CONFRONTATION:["We said what we needed to say. Now comes the hard part.",
    "You heard the words. I want to see what happens when the talking ends.",
    "A face-to-face isn't a result. There's more to settle."],
   DEBUT:["First night in front of this crowd. I won't forget it.",
    "You saw my first appearance. That's only the beginning.",
    "New place, new opportunity. I'm here to wrestle."],
   STABLE_INVITATION:["An offer was made out there. We'll see where it leads.",
    "Everybody saw the invitation. Nobody can say it was kept quiet.",
    "A big decision deserves some thought. I heard the offer."]
  };
  candidates.push({post:post(personId,name,e.slotId,"SHOW",
   show.showId+":"+e.slotId+":"+kind,lines[kind]!),
   position:e.position,priority:priority[kind]!});
 }
 const seen=new Set<string>();
 return candidates.sort((a,b)=>b.priority-a.priority||
  a.position-b.position||a.post.personId.localeCompare(b.post.personId))
  .filter(c=>{if(seen.has(c.post.personId))return false;
   seen.add(c.post.personId);return true;})
  .slice(0,3).map(c=>c.post);
}
/** Public World News already returns weekly-award participant IDs/names.
 * A matching award is the only warrant for putting words in a wrestler's
 * in-game social account. DIRT never creates a wrestler quote.
 */
export function projectHotTagNewsWrestlerPost(
 story:HotTagNewsStory,awards:readonly VerifiedHotTagAward[],
):HotTagWrestlerPost|null{
 if(story.desk!=="OFFICIAL"||!validId(story.promotionId)||
  !["MATCH","ANGLE"].includes(story.sourceKind??""))return null;
 const kind=story.sourceKind as "MATCH"|"ANGLE";
 const award=awards.find(a=>a.kind===kind&&
  a.year===story.year&&a.week===story.week&&
  a.promotionId===story.promotionId&&
  story.id===(kind==="MATCH"?"match:":"angle:")+a.showId+":"+a.slotId);
 if(!award)return null;
 const personId=award.personIds[0],name=award.peopleNames[0];
 if(!validId(personId)||!validName(name))return null;
 const lines=kind==="MATCH"?[
  "We went out there and wrestled. The match is there for everybody to watch.",
  "I saw the reactions to our match. There's nothing quite like that crowd.",
  "Everybody's got a rating. I was the one in the ring.",
  "You can debate the stars. The work happened between the bells.",
  "Appreciate the people who watched. That was a fight worth having."
 ]:[
  "The whole crowd saw what happened tonight. We'll see where it leads.",
  "I know the cameras caught that moment. I haven't forgotten it either.",
  "That was one chapter. I'm interested in what comes next.",
  "There's plenty of noise about what happened. Keep watching."
 ];
 return post(personId,name,award.slotId,"NEWS",
  story.id+":"+story.year+":"+story.week,lines);
}
