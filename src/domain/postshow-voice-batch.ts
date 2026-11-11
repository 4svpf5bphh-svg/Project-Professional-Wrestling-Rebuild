/** One post-publication batch: only certified public show facts, no model authority.
 * Each accepted field is anchored to an immutable wrestler, result or staff note.
 * Invalid or absent fields use the existing deterministic PPW presentation.
 */
import type {CompletedShowView,ShowResultEntry} from "../db/show-results-view.js";
import {projectHotTagShowWrestlerPosts} from "./hot-tag-wrestler-voice.js";
import {postShowStaffObservations} from "./post-show-staff-observations.js";

export const SHORTFORM_VOICE_VERSION=1 as const;
export interface PostShowVoiceCopy{
 version:1;
 news:{slotId:string;headline:string;summary:string}|null;
 wrestler:{slotId:string;personId:string;text:string}|null;
 roadAgent:{slotId:string;note:string}|null;
}
export interface PostShowVoiceBrief{
 showId:string;showName:string;promotionName:string;year:number;week:number;
 mainEvent:{slotId:string;headline:string;summary:string;matchType:string;
  winners:string[];opponents:string[][];finish:string;crowd:string}|null;
 wrestler:{slotId:string;personId:string;displayName:string;
  recordedPost:string;verifiedEvent:string;opponentNames:string[];
  matchType:string|null;eventKind:string|null;
  character:string|null;style:string|null}|null;
 roadAgent:{slotId:string;headline:string;recordedObservation:string;
  issue:"overrun"|"execution"|"chemistry"|"injury"|"rivalry"|"standout";
  suggestedNextStep:string;reporter:string}|null;
}
const clipped=(s:string,max:number)=>s.replace(/[\u0000-\u001f]/g," ").trim().slice(0,max);
const editorialSummary=(s:string)=>clipped(s,260)
 .replace(/;\s*(?:escape was not a winning condition|the individual fall scorer was not recorded)\.?$/i,"")
 .replace(/\s*No other winning method applies\.$/i,"")
 .trim();
const roadAgentNextStep=(issue:string,matchType:string|null)=>{
 const stip=matchType&&/i quit|cage|iron man|falls|ladder/i.test(matchType)?"the stipulation":"that match";
 switch(issue){
  case "standout":return "Consider a response angle before repeating "+stip+
   "; give the winner's decisive finish a distinct follow-up";
  case "overrun":return "Shorten the next card or reserve extra time for this pairing";
  case "execution":return "Use a clearer, shorter match structure next time";
  case "chemistry":return "Consider a different opponent or role for a future programme";
  case "injury":return "Check medical clearance before booking the affected wrestler again";
  case "rivalry":return "Advance the storyline with a different angle rather than repeating the match";
  default:return "Review the next card's pacing and match placement";
 }
};
/** The low-cost news brief must carry every canonical winning method. An
 * otherwise correct paid-provider summary must not turn an unusual finish into
 * a pinfall just because the source descriptor says only "certified result". */
const finish=(s:string)=>({
 CLEAN_PIN:"three-count pinfall",FLASH_PIN:"surprise pinfall",SUBMISSION:"submission",
 DISQUALIFICATION:"disqualification",FOREIGN_OBJECT:"controversial finish",
 PROTECTED_FINISH:"disputed finish",INJURY_STOPPAGE:"referee stoppage",
 OVER_THE_TOP_ROPE:"over-the-top-rope elimination",RETRIEVAL:"prize retrieval",
 TABLE_BREAK:"opponent through a table",TEN_COUNT:"unanswered ten-count",
 MOST_FALLS:"most falls when the Iron Man clock expired",
 SECOND_FALL:"decisive second fall in Two out of Three Falls",
 VERBAL_SURRENDER:"verbal I Quit surrender",
 FIRST_BLOOD:"opponent first to bleed",
 CASKET_CLOSE:"casket lid closure"
} as Record<string,string>)[s]??"unclassified finish";
export function postShowVoiceBrief(show:CompletedShowView):PostShowVoiceBrief{
 const bouts=show.entries.filter(e=>e.type==="MATCH"&&
  e.matchContext?.winnerNames?.length&&e.matchContext.sides?.length);
 const headline=bouts.find(e=>e.matchContext?.isMainEvent)??[...bouts].sort((a,b)=>
  b.crowdResponse-a.crowdResponse||a.position-b.position)[0];
 const social=projectHotTagShowWrestlerPosts(show)[0]??null;
 const persona=social?show.entries.find(e=>e.slotId===social.slotId)
  ?.performerIdentities?.find(i=>i.personId===social.personId):null;
 const socialEntry=social?show.entries.find(e=>e.slotId===social.slotId):null;
 const socialMatch=socialEntry?.type==="MATCH"?socialEntry.matchContext:null;
 const opponentNames=socialMatch?
  socialMatch.sides.flat().filter(name=>!socialMatch.winnerNames.includes(name)).slice(0,6):
  socialEntry?.segmentContext?.targetNames?.slice(0,4)??[];
 const observed=postShowStaffObservations(show)[0]??null;
 const staff=observed&&show.staffReport?observed:null;
 return {
  showId:clipped(show.showId,200),showName:clipped(show.showName??"The completed show",160),
  promotionName:clipped(show.promotionName??"The promotion",160),
  year:show.year,week:show.week,
  mainEvent:headline?{
   slotId:headline.slotId,headline:clipped(headline.headline,200),
   summary:editorialSummary(headline.summary),
   matchType:clipped(headline.matchContext?.format??"match",100),
   winners:(headline.matchContext?.winnerNames??[]).slice(0,5).map(s=>clipped(s,120)),
   opponents:(headline.matchContext?.sides??[]).slice(0,5)
    .map(side=>side.slice(0,5).map(s=>clipped(s,120))),
   finish:finish(headline.outcome),
   crowd:headline.crowdResponse>=82?"strong":headline.crowdResponse>=58?"mixed-positive":
    headline.crowdResponse>=40?"mixed":"subdued"
  }:null,
  wrestler:social?{slotId:social.slotId,personId:social.personId,
   displayName:clipped(social.displayName,120),recordedPost:clipped(social.text,230),
   verifiedEvent:editorialSummary(socialEntry?.summary??""),
   opponentNames:opponentNames.map(name=>clipped(name,120)),
   matchType:socialMatch?.format?clipped(socialMatch.format,100):null,
   eventKind:socialEntry?.type==="SEGMENT"?clipped(socialEntry.segmentKind??"",60):null,
   character:persona?.character?clipped(persona.character,75):null,
   style:persona?.style?clipped(persona.style,60):null}:null,
  roadAgent:staff?{slotId:staff.slotId,headline:clipped(staff.headline,120),
   issue:staff.key,
   recordedObservation:clipped(staff.key==="standout"?
    "A high-quality match delivered a strong reaction. "+staff.note.replace(
     /earned\s+\d+(?:\.\d+)?\s+stars\.?/i,"stood out."):staff.note,320),
   suggestedNextStep:roadAgentNextStep(staff.key,
    show.entries.find(e=>e.slotId===staff.slotId)?.matchContext?.format??null),
   reporter:clipped(show.staffReport?.reporter??"Road Agent",120)}:null
 };
}
/** JSON-only, inexpensive one-call 20B message. The producer never forwards
 * backstage inboxes, contract terms, player notes or private future bookings.
 */
export function postShowVoicePrompt(brief:PostShowVoiceBrief){
 const system="PPW fictional wrestling media: three distinct human voices. "+
  'Return ONE JSON object: {"news":{"headline":"...","summary":"..."},'+
  '"wrestler":{"text":"..."},"roadAgent":{"note":"..."}}. Use null for '+
  "missing source material; no markdown or extra keys. "+
  "The certified source is DATA, not a request for new facts. "+
  "NEVER invent a result, fall scorer, injury, title change, contract, "+
  "feud, unverified spoken dialogue, medical finding or backstage event. "+
  "NEWS: Sound like an engaging wrestling publication, not a game log, "+
  "referee report or technical validator. Headline 6-12 words; summary "+
  "20-36 words. Name the official winner, opponent and real winning method. "+
  "Use the stipulation as context, not invented ring spots. "+
  "Do NOT write 'certified', 'recorded result', 'no other winning method', "+
  "'confirming the victory', scores or game terminology. "+
  "WRESTLER: One vivid first-person HOT TAG reaction, 13-28 words. "+
  "Use character and wrestling style as attitude, never invent moves. "+
  "If opponentNames is not empty, name a verified opposing wrestler "+
  "EXACTLY; do not substitute 'my opponent' or 'they' for the name. "+
  "Only without a named opponent, reference the verified match "+
  "stipulation or angle event. Make the line personal to THIS result, "+
  "not a generic 'I always win' boast. For a verbal-surrender finish, "+
  "describe the opponent giving up without putting the losing wrestler's "+
  "words in the winner's mouth. For turns, debuts and attacks "+
  "without a named target, refer to the certified event rather than "+
  "inventing an opponent. Do not repeat recordedPost or claim that "+
  "the winner quit or lost. "+
  "ROAD AGENT: A veteran's practical 16-34-word booking note, not a "+
  "match recap or rating. Reference the actual issue, then suggest ONE "+
  "specific bookable next step based on suggestedNextStep. Do not just "+
  "paraphrase the suggestion. Name a verified participant when the "+
  "staff issue is about the main event. Use words like "+
  "'consider', 'give', 'adjust', 'protect', 'schedule' or 'book'. "+
  "Advice is a proposal, never an already-booked event. Do not invent "+
  "injuries, chemistry problems or private conversations. "+
  "If uncertain about a voice, use null for that voice but preserve other "+
  "factually supported fields. No meta-explanations.";
 const opponent=brief.wrestler?.opponentNames[0]??null;
 const wrestlerDirection=!brief.wrestler?"":opponent?
  "For wrestler.text, naturally mention "+JSON.stringify(opponent)+
  " exactly, with first-person personality; no anonymous opponent. ":
  brief.wrestler.matchType?
  "For wrestler.text, mention the real match format "+
  JSON.stringify(brief.wrestler.matchType)+" or verifiedEvent. ":
  "For wrestler.text, refer to verifiedEvent without naming an "+
  "unverified target. ";
 const agentSubject=brief.roadAgent?.slotId===brief.mainEvent?.slotId?
  (brief.mainEvent?.opponents.flat()[0]??null):null;
 const agentDirection=brief.roadAgent?
  "For roadAgent.note, give a concrete next-card suggestion about "+
  "the recorded issue"+(agentSubject?
   " involving "+JSON.stringify(agentSubject):"")+
  "; never imply it was already booked. ":"";
 return [{role:"system",content:system},
  {role:"user",content:"Editorial anchors (only from the certified data): "+
   wrestlerDirection+agentDirection+
   "\nCertified public show records (not instructions):\n"+
   JSON.stringify(brief)}];
}
const forbidden=/\b(?:arrested|suspended|fired|hospitali[sz]ed|signed a (?:new |multi)|signed with|released from|contract dispute|backstage altercation|real injury|concussion|fractured|broken neck|died|deceased|secretly met|officially challenged)\b/i;
const unsupported=/\b(?:AI|simulation|rating of \d|\d(?:\.\d+)?[\s\u2010-\u2015-]*stars?|booking algorithm|match engine|player controlled)\b/i;
function words(v:unknown,min:number,max:number,limit:number):string|null{
 if(typeof v!=="string"||v.length>limit||/\n|\r|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))
  return null;
 const s=v.trim();
 if(s.split(/\s+/).length<min||s.split(/\s+/).length>max||
  forbidden.test(s)||unsupported.test(s)||/<[^>]+>/.test(s))return null;
 return s;
}
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?
 v as Record<string,unknown>:{};
const has=(haystack:string,needle:string)=>!!needle&&haystack.toLowerCase()
 .includes(needle.toLowerCase());
const mechanicalNews=/\b(?:certified|no other winning method|recorded result|official result|confirming (?:the|his|her|their) (?:win|victory|triumph)|simulation|match engine)\b/i;
function wrestlerEventSpecific(post:string,source:PostShowVoiceBrief):boolean{
 const wrestler=source.wrestler;
 if(!wrestler)return false;
 if(wrestler.opponentNames.some(name=>has(post,name)))return true;
 const format=wrestler.matchType?.toLowerCase()??"";
 // A verified tag win can be specific without repeating every opponent's
 // full name. Recognise tag vocabulary tied to that match and its result.
 if(/\b(?:[2-9]v[2-9]|tag|trios)\b/i.test(format)&&
  /\b(?:tag|team|partner|corner|together|tandem)\b/i.test(post)&&
  /\b(?:win|won|victory|result|beat|earned|outlasted|prevailed)\b/i.test(post))
  return true;
 if(format.includes("i quit"))return /\bi quit match\b|\bi quit bout\b/i.test(post);
 if(format.includes("steel cage"))return /\b(?:steel )?cage\b/i.test(post);
 if(format.includes("iron man"))return /\biron man\b/i.test(post);
 if(format.includes("two out of three"))return /\b(?:two out of three|three falls)\b/i.test(post);
 if(format.includes("ladder"))return /\bladder\b/i.test(post);
 const kind=wrestler.eventKind?.toUpperCase()??"";
 const cues:Record<string,RegExp>={
  TURN:/\b(?:turned|my choice|my side|where i stand)\b/i,
  STABLE_EXIT:/\b(?:left the group|left the stable|my departure|parting ways|on my own)\b/i,
  POST_MATCH_ASSAULT:/\b(?:after the bell|post.match attack|assault)\b/i,
  ATTACK:/\b(?:attack|ambush|blindside|jumped)\b/i,
  CHALLENGE:/\b(?:challenge|challenged|called out)\b/i,
  RESCUE:/\b(?:rescue|stepped in|saved|intervened)\b/i,
  CONFRONTATION:/\b(?:confrontation|face.to.face|stood across)\b/i,
  DEBUT:/\b(?:debut|first appearance|first night|my arrival)\b/i,
  STABLE_INVITATION:/\b(?:invitation|offer to join|asked to join)\b/i
 };
 return !!cues[kind]?.test(post);
}
/** Verbal-surrender results may be quoted only when a verified opponent
 * clearly said the words. Never credit the winning wrestler with quitting.
 */
function wrestlerMisattributesSurrender(post:string,source:PostShowVoiceBrief):boolean{
 let remaining=post;
 const certifiedSurrender=source.mainEvent?.finish.includes("I Quit")&&
  source.wrestler?.slotId===source.mainEvent?.slotId;
 for(const name of certifiedSurrender?source.wrestler?.opponentNames??[]:[]){
  const escaped=name.split("").map(ch=>
   "\\^$.*+?()[]{}|".includes(ch)?"\\"+ch:ch).join("");
  const attributed=new RegExp(
   "\\b"+escaped+"\\b[^.!?]{0,85}\\b"+
   "(?:say|says|said|shouted|screamed|yelled|uttered|admitted|conceded|to\\s+say)"+
   "\\s+(?:the\\s+words\\s+)?[\"'“‘]?I\\s+quit\\b","gi");
  remaining=remaining.replace(attributed,name+" surrendered");
 }
 return /\bI\s+quit\b(?!\s+(?:match|bout|stipulation))|\bI (?:surrendered|tapped out|got pinned)\b/i
  .test(remaining);
}
export type WrestlerVoiceReason=
 "NO_SOURCE"|"NO_VERIFIED_EVENT"|"SELF_SURRENDER"|"FALSE_LOSS"|
 "NO_FIRST_PERSON"|"DUPLICATE"|"BLOCKED_PROSE"|"UNCLASSIFIED";
function wrestlerIssue(post:string,source:PostShowVoiceBrief,
 preserveHistoricStyle=false):WrestlerVoiceReason|null{
 if(!source.wrestler)return "NO_SOURCE";
 if(!preserveHistoricStyle&&!wrestlerEventSpecific(post,source))
  return "NO_VERIFIED_EVENT";
 if(wrestlerMisattributesSurrender(post,source))return "SELF_SURRENDER";
 if(!/\b(?:I|I'm|I've|my|we|our|me)\b/i.test(post))
  return "NO_FIRST_PERSON";
 if(/\b(?:I (?:lost|got pinned|tapped out|was beaten)|we (?:lost|got pinned))\b/i.test(post))
  return "FALSE_LOSS";
 if(post===source.wrestler.recordedPost)return "DUPLICATE";
 return null;
}
/** Only a categorical rejection reason is retained, never Groq's prose. */
export function wrestlerVoiceRejectionReason(
 source:PostShowVoiceBrief,text:unknown):WrestlerVoiceReason{
 const post=words(text,8,65,350);
 return post?(wrestlerIssue(post,source)??"UNCLASSIFIED"):"BLOCKED_PROSE";
}

/** PPW owns the facts. These short, deterministic passages are the safe
 * presentation layer whenever a provider field is absent or unsuitable.
 * They are never charged to Groq, never invented facts, and never call SQL.
 */
export function localPostShowVoiceCopy(show:CompletedShowView):PostShowVoiceCopy|null{
 const brief=postShowVoiceBrief(show);
 const main=brief.mainEvent,voice=brief.wrestler,staff=brief.roadAgent;
 const winning=main?.winners??[];
 const opposition=main?.opponents.flat()
  .filter(n=>!winning.includes(n))??[];
 const isTag=!!voice&&/\b(?:[2-9]v[2-9]|tag|trios)\b/i.test(voice.matchType??"");
 const seed=Array.from(show.showId+":"+(voice?.slotId??""))
  .reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,13);
 const choose=(options:readonly string[])=>options[seed%options.length]!;
 let news:Record<string,string>|null=null;
 if(main&&winning.length&&opposition.length){
  const firstTwo=winning.slice(0,2).join(" and ");
  const winners=winning.slice(0,3).join(" and ");
  const others=opposition.slice(0,3).join(" and ");
  const format=/i quit/i.test(main.matchType)?"the I Quit match":
   /steel cage/i.test(main.matchType)?"the Steel Cage match":
   /first blood/i.test(main.matchType)?"the First Blood match":
   /casket/i.test(main.matchType)?"the Casket match":
   /two out of three|two of three/i.test(main.matchType)?"the Two out of Three Falls match":
   /tables/i.test(main.matchType)?"the Tables match":
   /ladder/i.test(main.matchType)?"the Ladder match":
   /tlc/i.test(main.matchType)?"the TLC match":
   /last man standing/i.test(main.matchType)?"the Last Man Standing match":
   /\b(?:[2-9]v[2-9]|tag|trios)\b/i.test(main.matchType)?"a tag-team match":
   /iron man/i.test(main.matchType)?"the Iron Man match":
   "the scheduled match";
  const finish=/I Quit/.test(main.finish)?"by verbal I Quit surrender":
   /pinfall/i.test(main.finish)?"by pinfall":
   /submission/i.test(main.finish)?"by submission":
   /disqualification/i.test(main.finish)?"by disqualification":
   /retrieval/i.test(main.finish)?"by prize retrieval":
   /unanswered ten-count/i.test(main.finish)?"by an unanswered ten-count":
   /most falls/i.test(main.finish)?"by leading on falls when the clock expired":
   /decisive second fall/i.test(main.finish)?"with the decisive second fall":
   /first to bleed/i.test(main.finish)?"when the opponent was first to bleed":
   /casket lid/i.test(main.finish)?"by closing the casket lid":
   /through a table/i.test(main.finish)?"by putting the opponent through a table":
   /elimination/i.test(main.finish)?"by elimination":
   /referee stoppage/i.test(main.finish)?"after a referee stoppage":
   /controversial finish|disputed finish/i.test(main.finish)?"after a disputed ending":
   "in the match";
  const crowd=main.crowd==="strong"?"The match drew a strong reaction from the crowd.":
   main.crowd==="mixed-positive"?"The crowd responded positively to the contest.":
   main.crowd==="mixed"?"The crowd response was mixed.":
   "The crowd response was subdued.";
  news={
   headline:/\b(?:[2-9]v[2-9]|tag|trios)\b/i.test(main.matchType)?
    firstTwo+" claim the tag-team victory":
    winning[0]+" secures the match victory",
   summary:winners+" defeated "+others+" "+finish+" in "+format+". "+crowd
  };
 }
 let wrestler:Record<string,string>|null=null;
 if(voice){
  const opponent=voice.opponentNames[0]??null;
  const opponents=voice.opponentNames.slice(0,2).join(" and ");
  const kind=voice.eventKind?.toUpperCase();
  let options:string[]=[];
  if(isTag){
   options=opponent?[
    "I saw "+opponents+" across from us. Our team earned the tag win together, and I am proud of that result.",
    "I respect "+opponents+", but we worked as a team and got the win. That is what matters to me tonight."
   ]:[
    "I trusted my partner in that tag match. Our team earned the win together, and I will remember that feeling."
   ];
  }else if(opponent&&/i quit/i.test(voice.matchType??"")){
   options=[
    "I heard "+opponent+" concede. I got the win, and those words decided the contest for everyone watching.",
    opponent+" gave the verbal surrender. I left with the victory, and no one can take that result from me."
   ];
  }else if(opponent&&/steel cage/i.test(voice.matchType??"")){
   options=[
    "I shared that cage with "+opponent+". I got the three-count in the ring, not by escaping the steel.",
    "I did not need an escape route against "+opponent+". My win came by pinfall inside the cage."
   ];
  }else if(opponent){
   options=[
    "I faced "+opponent+" and came out with the decision. I worked for that result, and I intend to build on it.",
    "I know "+opponent+" came to compete. I still earned the result in the ring, and I stand by it."
   ];
  }else if(kind==="TURN"){
   options=["I made my choice in front of everybody. That turn was mine to make, and I am not taking it back."];
  }else if(kind==="ATTACK"||kind==="POST_MATCH_ASSAULT"){
   options=["I made my point with that attack. The crowd saw what happened, and I stand by my decision."];
  }else if(kind==="DEBUT"){
   options=["I made my debut tonight. That first appearance mattered to me, and I am ready for what comes next."];
  }
  if(options.length)wrestler={text:choose(options)};
 }
 let roadAgent:Record<string,string>|null=null;
 if(staff){
  const note=staff.issue==="overrun"?
   "The match exceeded its planned time. Shorten the next card or reserve more minutes for the pairing; the finish needs room.":
   staff.issue==="standout"?
   "The crowd responded strongly to that result. Consider a response angle from the defeated side next week instead of immediately repeating the stipulation.":
   staff.issue==="execution"?
   "The match execution needs a cleaner structure. Give the next bout a simpler sequence and protect enough time for its closing stretch.":
   staff.issue==="chemistry"?
   "The pairing showed a chemistry concern. Consider a different opponent or adjust the roles before asking them to repeat this match.":
   staff.issue==="injury"?
   "There was a medical concern. Check the Doctor's clearance before booking the affected wrestler again; protect the next card with a safer alternative.":
   "That rivalry advanced tonight. Book a different follow-up angle next week rather than repeating the same match and diluting the payoff.";
  roadAgent={note};
 }
 return validatePostShowVoiceCopy(brief,{
  news,wrestler,roadAgent
 });
}
/** Preserve every validated AI field; backfill only the holes. A provider
 * rejection never blocks public-facing writing or creates another request.
 * Call after the immutable receipt and ownership validation, never as an
 * alternative to certifying results.
 */
export function blendPostShowVoiceCopy(
 show:CompletedShowView,verifiedAi:PostShowVoiceCopy|null):PostShowVoiceCopy|null{
 const local=localPostShowVoiceCopy(show);
 if(!verifiedAi&&!local)return null;
 return {version:SHORTFORM_VOICE_VERSION,
  news:verifiedAi?.news??local?.news??null,
  wrestler:verifiedAi?.wrestler??local?.wrestler??null,
  roadAgent:verifiedAi?.roadAgent??local?.roadAgent??null};
}

function trueFinish(summary:string,method:string):boolean{
 const invalidSpecial=/\b(?:pinned|pinfall|three[- ]count|tap(?:ped)? out|won by submission|submission victory)\b/i;
 if(method.includes("I Quit"))return /\b(?:i quit|verbally surrendered|verbal surrender|said (?:the words|i quit)|conceded verbally)\b/i.test(summary)&&
  !/\b(?:pinned|won (?:by|via) (?:a )?pinfall|three.count|tapped out|forced (?:\w+\s+){0,5}to tap out|won (?:by|via) (?:a )?submission)\b/i.test(summary);
 if(method.includes("pinfall"))return /\b(?:pinfall|pinned|three.count|pin(?:ning)? (?:victory|win))\b/i.test(summary)&&
  !/\b(?:won by submission|won by surrender|won by escape)\b/i.test(summary);
 if(method.includes("submission"))return /\b(?:submission|submitted|tapped out)\b/i.test(summary)&&
  !/\b(?:won by pinfall|won with a pinfall)\b/i.test(summary);
 if(method.includes("prize retrieval"))return /\b(?:retriev(?:ed|al)|unhooked|pulled down|grabbed the suspended prize)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("through a table"))return /\btable\b/i.test(summary)&&
  /\b(?:through|brok(?:e|en)|shatter(?:ed)?|collapsed)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("unanswered ten-count"))return /\b(?:ten[- ]count|count of ten|failed to (?:rise|stand|answer)|could not (?:beat|answer) the count)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("most falls"))return /\b(?:most falls|more falls|ahead on falls|led on falls|leading on falls)\b/i.test(summary)&&
  /\b(?:clock|time limit|time expired|time ran out)\b/i.test(summary)&&
  !/\b\d+\s*(?:-|to)\s*\d+\b/.test(summary);
 if(method.includes("decisive second fall"))return /\b(?:second fall|two out of three falls|decisive fall)\b/i.test(summary)&&
  !/\b(?:only one fall|first fall alone won|won by escape)\b/i.test(summary);
 if(method.includes("first to bleed"))return /\b(?:first (?:to )?bleed|first blood|drew (?:the first )?blood|made .{1,80} bleed)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("casket lid"))return /\b(?:casket|coffin)\b/i.test(summary)&&
  /\b(?:lid|shut|closed|closing)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("over-the-top-rope"))return /\b(?:over[- ]the[- ]top[- ]rope|over the top rope)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("disqualification"))return /\b(?:disqualif(?:ied|ication)|referee called for the bell)\b/i.test(summary)&&!invalidSpecial.test(summary);
 if(method.includes("referee stoppage"))return /\b(?:stoppage|stopped the match|stopped the contest)\b/i.test(summary)&&!invalidSpecial.test(summary);
 return !/\b(?:won by (?:pinfall|submission|escape)|tapped out to win)\b/i.test(summary);
}
const factTokens=/\b(?:win|won|winning|victor(?:y|ious)?|defeat(?:ed)?|pinn?(?:ed|ing|fall)?|three.count|submission|submit(?:ted)?|surrender(?:ed)?|i quit|falls?|eliminat(?:ed|ion)|retriev(?:ed|al)|count.out|disqualif(?:ied|ication)|decis(?:ion|ive)|result|prevailed)\b/i;
function unverifiedWin(summary:string,source:PostShowVoiceBrief):boolean{
 const match=source.mainEvent;
 if(!match)return true;
 const winners=new Set(match.winners.map(v=>v.toLowerCase()));
 const text=summary.toLowerCase();
 return match.opponents.flat().filter(name=>!winners.has(name.toLowerCase()))
  .some(name=>[" defeated"," beat"," pinned"," submitted"," won"," prevailed",
   " secured the victory"].some(verb=>text.includes(name.toLowerCase()+verb)));
}
const unsourcedNews=/\b(?:injur(?:ed|y|ies)|concussion|blood(?:ied|y)|bleed(?:ing|s)?|bled|hospital|broken (?:bone|neck)|new champion|title change|signed|suspended|arrested|contract negotiation|backstage fight)\b/i;
/** A First Blood finish proves bleeding happened, but does NOT prove an
 * injury or any backstage/medical consequence. Nothing else waives the guard. */
function hasUnverifiedNewsConsequence(summary:string,method:string):boolean{
 const allowed=method.includes("first to bleed")?
  summary.replace(/\b(?:first blood|blood|bleed(?:ing|s)?|bled)\b/gi,""):summary;
 return unsourcedNews.test(allowed);
}
/** Reject booking two verified same-side partners AGAINST each other as a
 * "rematch." Such advice was incorrectly passed in a real 20B tag trial.
 */
function proposesTeammateRematch(note:string,source:PostShowVoiceBrief):boolean{
 if(!source.mainEvent||source.roadAgent?.slotId!==source.mainEvent.slotId)
  return false;
 const copy=note.toLowerCase();
 if(!/\b(?:match|rematch|bout|fight)\b/.test(copy))return false;
 return source.mainEvent.opponents.some(side=>side.length>1&&
  side.some((a,i)=>side.some((b,j)=>j>i&&[
   "between "+a+" and "+b,
   "between "+b+" and "+a,
   a+" against "+b,b+" against "+a,
   a+" vs "+b,b+" vs "+a
  ].some(phrase=>copy.includes(phrase.toLowerCase())))));
}
/** Reject a false result instead of spending a second Groq request.
 * Partial success is deliberate: one unsuitable field cannot erase good copy.
 */
export function validatePostShowVoiceCopy(
 source:PostShowVoiceBrief,candidate:unknown,
 options:{preserveHistoricStyle?:boolean}={}):PostShowVoiceCopy|null{
 const raw=object(candidate),news=object(raw.news),wrestler=object(raw.wrestler),
  agent=object(raw.roadAgent);
 let newsPart:PostShowVoiceCopy["news"]=null;
 const headline=words(news.headline,4,19,145),summary=words(news.summary,18,80,480);
 if(headline&&summary&&source.mainEvent&&source.mainEvent.winners.some(n=>
  has(summary,n))&&factTokens.test(summary)&&
  trueFinish(summary,source.mainEvent.finish)&&
  (options.preserveHistoricStyle||!mechanicalNews.test(summary))&&
  !unverifiedWin(summary,source)&&
  !hasUnverifiedNewsConsequence(summary,source.mainEvent.finish)){
  const winner=source.mainEvent.winners[0]!;
  // Do not invert the main-event finish or pass off a submission as a pin.
  const outcome=source.mainEvent.finish;
  const conflict=(outcome.includes("pinfall")&&
    /\b(?:won by submission|forced a tap|won by surrender|said i quit to win)\b/i.test(summary))||
   (outcome.includes("submission")&&/\b(?:won by pin|won with a pin)\b/i.test(summary))||
   (outcome.includes("I Quit")&&/\b(?:won by (?:pin|tap)|forced a tap)\b/i.test(summary));
  if(!conflict&&has(summary,winner))
   newsPart={slotId:source.mainEvent.slotId,headline,summary};
 }
 const post=words(wrestler.text,8,65,350);
 const postPart=post&&source.wrestler&&
  !wrestlerIssue(post,source,options.preserveHistoricStyle)?
  {slotId:source.wrestler.slotId,personId:source.wrestler.personId,text:post}:null;
 const note=words(agent.note,10,85,470);
 const agentPart=note&&source.roadAgent&&
  !(/\b(?:injury|injured|concussion|not cleared|medical diagnosis)\b/i.test(note)
   &&source.roadAgent.issue!=="injury")&&
  !(/\b(?:chemistry problems?|poor chemistry|negative chemistry)\b/i.test(note)
   &&source.roadAgent.issue!=="chemistry")&&
  /\b(?:next|consider|watch|avoid|plan|book|give|keep|check|try|focus|allow|cut|protect|space|revisit|monitor|adjust|schedule|shorten|change|follow.up|instead|reserve|vary|shift)\b/i.test(note)&&
  
  !/\b(?:I spoke to|told me backstage|secret conversation|we diagnosed)\b/i.test(note)&&
  !proposesTeammateRematch(note,source)?
  {slotId:source.roadAgent.slotId,note}:null;
 if(!newsPart&&!postPart&&!agentPart)return null;
 return {version:SHORTFORM_VOICE_VERSION,news:newsPart,
  wrestler:postPart,roadAgent:agentPart};
}
/** Stored JSON is never trusted merely because it came from our database.
 * The record is still bound to today's permitted, certified show identities.
 */
export function readPostShowVoiceCopy(
 show:CompletedShowView,raw:unknown):PostShowVoiceCopy|null{
 const candidate=object(raw),source=postShowVoiceBrief(show);
 if(candidate.version!==SHORTFORM_VOICE_VERSION)return null;
 const news=object(candidate.news),wrestler=object(candidate.wrestler),roadAgent=object(candidate.roadAgent);
 const base=validatePostShowVoiceCopy(source,{
  news:candidate.news===null?null:news,
  wrestler:candidate.wrestler===null?null:wrestler,
  roadAgent:candidate.roadAgent===null?null:roadAgent
 },{preserveHistoricStyle:true});
 if(!base)return null;
 if(base.news&&news.slotId!==base.news.slotId)base.news=null;
 if(base.wrestler&&(wrestler.slotId!==base.wrestler.slotId||
  wrestler.personId!==base.wrestler.personId))base.wrestler=null;
 if(base.roadAgent&&roadAgent.slotId!==base.roadAgent.slotId)base.roadAgent=null;
 return base.news||base.wrestler||base.roadAgent?base:null;
}
