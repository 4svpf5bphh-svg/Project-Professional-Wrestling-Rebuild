
import {projectUniqueHotTagNewsThread,hotTagNewsCast,nearHotTagCopy,hotTagFanTemperament,type HotTagNewsStory,type HotTagNewsPost} from "./hot-tag-news.js";
export type WeeklyStory = HotTagNewsStory & {certainty:"CONFIRMED"|"SPECULATION";humanManaged?:boolean;showId?:string;showName?:string|null;priority?:number};
import {projectHotTagNewsWrestlerPost,type HotTagWrestlerPost,type VerifiedHotTagAward} from "./hot-tag-wrestler-voice.js";
export type WeeklyStoryCopy = {fanCast?:"ROTATING";headline?:string;commentary?:string;fans?:[string|null,string|null,string|null,...(string|null)[]];wrestler?:{personId:string;text:string}};
export type WeeklyHistory={year:number;week:number;promotionId:string;title:string};
export type WeeklyAnchor={key:string;story:WeeklyStory;wrestler?:HotTagWrestlerPost;previous?:WeeklyHistory;recentFanCopy?:readonly string[]};
export const WEEKLY_RATINGS_STORY="broadcast:ratings:weekly";
export type WeeklyTvFact={promotionId:string;promotionName:string;rating:number;humanManaged:boolean};
export function weeklyRatingsStory(year:number,week:number,episodes:readonly WeeklyTvFact[]):WeeklyStory|null{
 const ranked=episodes.filter(e=>Number.isFinite(e.rating)&&e.rating>=0&&e.promotionName.trim()).sort((a,b)=>
  Number(b.humanManaged)-Number(a.humanManaged)||b.rating-a.rating||a.promotionId.localeCompare(b.promotionId)).slice(0,3);
 if(!ranked.length)return null;
 const first=ranked[0]!;
 return {id:WEEKLY_RATINGS_STORY,year,week,desk:"OFFICIAL",certainty:"CONFIRMED",sourceKind:"RATINGS",
  promotionId:first.promotionId,promotionName:first.promotionName,
  title:"Weekly TV watch: "+ranked.map(e=>e.promotionName).join(" / "),
  summary:ranked.map(e=>e.promotionName+": "+e.rating.toFixed(2)+" household rating").join("; ")+
   ". These are separate certified broadcasts; figures are not necessarily from the same time slot."};
}
export function readWeeklyRatingsStory(raw:unknown,year:number,week:number):WeeklyStory|null{
 const s=object(raw);
 if(s.id!==WEEKLY_RATINGS_STORY||s.year!==year||s.week!==week||s.desk!=="OFFICIAL"||
  s.certainty!=="CONFIRMED"||s.sourceKind!=="RATINGS"||typeof s.promotionId!=="string"||
  typeof s.promotionName!=="string"||typeof s.title!=="string"||typeof s.summary!=="string"||
  s.promotionName.length>200||s.title.length>650||s.summary.length>1000)return null;
 return {id:WEEKLY_RATINGS_STORY,year,week,desk:"OFFICIAL",certainty:"CONFIRMED",sourceKind:"RATINGS",
  promotionId:s.promotionId,promotionName:s.promotionName,title:s.title,summary:s.summary};
}
const norm=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
// Opinions may use natural wrestling vocabulary. Actual event claims must
// be supported by the exact public source, and rumour is never authority.
const risky=/\b(?:won|wins|lost|loses|defeated|pinned|submitted|retained|retains|injured|concussion|hospital|fractur\w*|fired|signed|released|suspended|arrested|died|confirmed|officially|booked|scheduled|announced|guaranteed|attacked|bloodied)\b/gi;
const forbidden=/\b(?:certified|simulation|game engine|player controlled|ai generated|prompt|slot id|kill yourself|go die|death threat|my sources|my source|i have heard|i can confirm|i was backstage|i have inside information|drug abuse|sexual misconduct|sexual assault|death threats?|i will kill|i will hurt)\b|https?:|@[a-z0-9_]|[<>"\u0000-\u001f]/i;
const generic=new Set("the and for from with this that their they there about after before could should would wrestling championship promotion match weekly world report reports week television audience crowd future direction official confirmed result show night fans people think better really".split(" "));
const groundWords=(s:string)=>norm(s).split(" ").filter(w=>w.length>=3&&!generic.has(w));
function grounded(text:string,story:WeeklyStory){
 const hay=" "+norm(text)+" ",name=norm(story.promotionName);
 const acronym=name.split(" ").filter(Boolean).map(w=>w[0]).join("");
 return (name&&hay.includes(" "+name+" "))||
  (acronym.length>=2&&hay.includes(" "+acronym+" "))||
  groundWords(story.title+" "+story.promotionName).some(w=>hay.includes(" "+w+" "))||
  story.summary.match(/\b[A-Z][\p{L}]{2,}\b/gu)?.some(w=>!generic.has(norm(w))&&hay.includes(" "+norm(w)+" "))===true;
}
type Reject=(reason:string)=>void;
function bounded(v:unknown,story:WeeklyStory,min:number,max:number,chars:number,ground:boolean,reject:Reject=()=>{}){
 if(v===undefined||v===null||v===""){reject("MISSING");return undefined;}
 const raw=typeof v==="string"?v:object(v).text;
 if(typeof raw!=="string"){reject("SHAPE");return undefined;}
 const text=raw.trim().replace(/\s+/g," ").replace(/^(?:passionate promotion loyalist|dry wrestling nerd|sarcastic contrarian|sceptical smark|enthusiastic casual fan|irritated defender|wind[-‑– ]up merchant|thoughtful regular|dismissive rival fan|old[-‑– ]school wrestling fan|impatient critic|cheeky optimist)\s*:\s*/i,"");
 if(text.length>chars||forbidden.test(raw)){reject("UNSAFE_TEXT");return undefined;}
 const words=text.split(/\s+/).length;
 if(words<min||words>max){reject("LENGTH");return undefined;}
 // A single certified ratings snapshot is not evidence of a trend.
 if(story.id===WEEKLY_RATINGS_STORY&&/\b(?:outpac(?:e|es|ed|ing)|dominat(?:e|es|ed|ing)|defeat(?:s|ed|ing)?|grow(?:ing|th|n|s)?|grew|rising|risen|rose|climb(?:ing|ed|s)?|gain(?:ing|ed|s)?|improv(?:ing|ed|ement|es)|declin(?:ing|ed|e|es)|drop(?:ping|ped|s)?|fall(?:ing|en|s)?|fell|slid(?:ing|e)|losing ground|lost ground|week.on.week|momentum)\b/i.test(text)){
  reject("UNVERIFIED_RATINGS_TREND");return undefined;
 }
 const source=story.title+" "+story.summary+" "+story.promotionName+" "+(story.showName??"");
 if(/\b(?:raises? the stakes|passes? the in.ring test|earns? the replay|gets? face to face)\b/i.test(text)){
  reject("STOCK_PHRASE");return undefined;
 }
 if(/\b(?:rematch|replay|title shot|title opportunity|next challenger)\b/i.test(text)&&
  !/\b(?:rematch|replay|title shot|title opportunity|next challenger)\b[^.]{0,35}\b(?:signed|announced|booked|scheduled|accepted)\b/i.test(source)&&
  !/\b(?:if|would|could|should|might|hope|wish|want)\b|\?/i.test(text)){
  reject("UNVERIFIED_NEXT_EVENT");return undefined;
 }
 if(story.id===WEEKLY_RATINGS_STORY&&/\bCHA\b/.test(text)&&/Chaotic Wrestling Alliance/i.test(source)){
  reject("UNVERIFIED_PROMOTION_ALIAS");return undefined;
 }
 const sourceNumbers=(source.match(/\d+(?:\.\d+)?/g)??[]).map(Number);
 if((text.match(/\d+(?:\.\d+)?/g)??[]).map(Number).some(n=>!sourceNumbers.includes(n))){reject("NUMBER");return undefined;}
 for(const match of text.matchAll(risky)){
  const prefix=norm(text.slice(0,match.index)).split(" ").filter(Boolean);
  const suffix=norm(text.slice((match.index??0)+match[0].length)).split(" ").filter(Boolean);
  const phrase=[...prefix.slice(-2),norm(match[0]),...suffix.slice(0,2)].join(" ");
  if(story.desk==="DIRT"||prefix.length<1||suffix.length<1||!norm(source).includes(phrase)){
   reject("UNVERIFIED_CLAIM");return undefined;
  }
 }
 if(story.desk==="DIRT"&&ground&&!/\b(?:if|might|maybe|could|should|rumou?r|theory|hope|would|think|apparently|allegedly|wonder|doubt|believe|until|claims?|supposed|proof|evidence|speculation|whispers?|unverified|not buying)\b|\?/i.test(text)){
  reject("RUMOUR_CERTAINTY");return undefined;
 }
 if(ground&&!grounded(text,story)){reject("UNGROUNDED");return undefined;}
 return text;
}
export function validateWeeklyStoryCopy(story:WeeklyStory,value:unknown,speaker?:HotTagWrestlerPost|null,diagnose:(field:string,reason:string)=>void=()=>{}):WeeklyStoryCopy|null{
 const raw=object(value);
 const reject=(field:string)=> (reason:string)=>diagnose(field,reason);
 const headline=bounded(raw.headline,story,2,16,120,true,reject("headline"));
 const commentary=bounded(raw.commentary,story,5,65,480,true,reject("commentary"));
 const candidates=Array.isArray(raw.fans)?raw.fans:[];
 const first=bounded(candidates[0],story,3,32,200,true,reject("fan1"));
 const second=bounded(candidates[1],story,3,32,200,true,reject("fan2"));
 const third=first?bounded(candidates[2],story,3,32,200,false,reject("reply")):undefined;
 if(!first&&candidates[2])diagnose("reply","PARENT_REJECTED");
 const seen=new Set<string>();
 const dedup=(v:string|undefined,field:string)=>{
  if(!v)return null;
  const k=norm(v);if(seen.has(k)){diagnose(field,"DUPLICATE");return null;}
  seen.add(k);return v;
 };
 const fans:[string|null,string|null,string|null,...(string|null)[]]=[dedup(first,"fan1"),dedup(second,"fan2"),dedup(third,"reply"),
  ...candidates.slice(3,5).map((v,i)=>dedup(bounded(v,story,3,32,200,true,reject("fan"+(i+3))),"fan"+(i+3)))];
 const wrestler=object(raw.wrestler);
 const speech=speaker&&story.desk==="OFFICIAL"&&wrestler.personId===speaker.personId?
  bounded(wrestler.text,story,4,28,190,false,reject("wrestler")):undefined;
 const publicSpeech=speech&&speaker&&
  !["i m "+norm(speaker.displayName),"i am "+norm(speaker.displayName)].some(prefix=>norm(speech).startsWith(prefix))&&
  /\b(?:i|my|me|we|our|us)\b/i.test(speech)&&
  !/\b(?:next (?:match|show|week)|i promise|i challenge|i accept|i demand|i will face)\b/i.test(speech)?speech:undefined;
 if(speaker&&!publicSpeech)diagnose("wrestler","NO_VERIFIED_VOICE");
 const copy:WeeklyStoryCopy={...(headline?{headline}:{}),...(commentary?{commentary}:{}),...(fans.some(Boolean)?{fans,...(raw.fanCast==="ROTATING"?{fanCast:"ROTATING" as const}:{})}:{}),
  ...(speaker&&publicSpeech?{wrestler:{personId:speaker.personId,text:publicSpeech}}:{})};
 return Object.keys(copy).length?copy:null;
}
/** Public editorial significance, never unpublished booking or private contracts. */
export function weeklyStoryPriority(story:Pick<WeeklyStory,"id"|"sourceKind"|"title">&Partial<Pick<WeeklyStory,"summary"|"priority"|"desk">>):number{
 if(story.priority!==undefined)return story.priority;
 if(story.desk==="DIRT")return story.id.startsWith("followup:")?30:story.id.startsWith("wild:")?25:20;
 if(story.id.startsWith("signing:")&&story.summary?.includes("An established headliner joins the roster."))return 96;
 if(story.sourceKind==="TITLE"||story.id.startsWith("title:"))
  return /\bworld\b/i.test(story.title.split(" at ")[0]!)&&!story.summary?.includes("title was vacant")?100:83;
 if(story.id.startsWith("tournament:"))return 94;
 if(story.id.startsWith("match:")&&story.title.startsWith("A foreign object decides "))return 89;
 if(story.id.startsWith("event:"))return 88;
 if(story.id.startsWith("programme:official:"))return 86;
 const stars=story.summary?.match(/\b(\d(?:\.\d{1,2})?)[ -]star match\b/i)?.[1];
 if(story.id.startsWith("match:")&&Number(stars)>=4.5&&Number(stars)<=5)return 93;
 if(story.id.startsWith("match:")&&story.title.includes(" in the spotlight at "))return 84;
 if(story.sourceKind==="ANGLE"||story.id.startsWith("angle:"))return 82;
 if(story.sourceKind==="MATCH"||story.id.startsWith("match:"))return 76;
 if(story.id.startsWith("broadcast:network:"))return 72;
 if(story.id.startsWith("press:"))return 68;
 if(story.id.startsWith("signing:"))return 40;
 if(story.id===WEEKLY_RATINGS_STORY||story.id.startsWith("broadcast:"))return 10;
 return 20;
}
export function weeklyEditorialAnchors(stories:readonly WeeklyStory[],awards:readonly VerifiedHotTagAward[]=[],history:readonly WeeklyHistory[]=[],recentFanCopy:readonly string[]=[]):WeeklyAnchor[]{
 const official=stories.filter(s=>s.desk==="OFFICIAL"&&s.certainty==="CONFIRMED").sort((a,b)=>
  weeklyStoryPriority(b)-weeklyStoryPriority(a)||
  (a.id<b.id?-1:a.id>b.id?1:0));
 const lead=official[0];
 if(!lead)return [];
 // An award, a title result and an event recap can all refer to the same card.
 // Spend the second feature only on a substantial development from another show.
 const showKey=(s:WeeklyStory)=>s.showId||s.id.match(/^(?:match|angle|title|event):([^:]+)/)?.[1];
 const rumour=stories.filter(s=>s.desk==="DIRT"&&s.certainty==="SPECULATION"&&
  /^(?:wild:|followup:|rumour:(?:title|angle|breakout|creative):)/.test(s.id)&&
  !/\b(?:walk(?:ed|s)? out|departur\w*|arrest\w*|assault\w*|drug\w*|misconduct|backstage heat|ugly argument)\b/i.test(s.title+" "+s.summary)
 ).sort((a,b)=>weeklyStoryPriority(b)-weeklyStoryPriority(a)||(a.id<b.id?-1:a.id>b.id?1:0))[0];
 const second=rumour??official.find(s=>s!==lead&&weeklyStoryPriority(s)>=82&&
  (s.promotionId!==lead.promotionId||!!showKey(s)&&!!showKey(lead)&&showKey(s)!==showKey(lead)));
 const selected=second?[lead,second]:[lead];
 return selected.map((story,i)=>{
  const wrestler=projectHotTagNewsWrestlerPost(story,awards);
  const previous=history.find(h=>h.promotionId===story.promotionId&&
   (h.year<story.year||h.year===story.year&&h.week<story.week)&&
   groundWords(story.title).some(word=>!groundWords(story.promotionName).includes(word)&&groundWords(h.title).includes(word)));
  return {key:"s"+i,story,...(wrestler?{wrestler}:{}),...(previous?{previous}:{}),
   ...(i===0||story.desk==="DIRT"?{recentFanCopy:recentFanCopy.slice(0,12).map(t=>t.slice(0,100))}:{})};
 });
}
/** Required keys prevent a valid one-story JSON object masquerading as a full edition. */
export function weeklyEditorialResponseFormat(anchors:readonly WeeklyAnchor[]){
 const string={type:"string"};
 const properties=Object.fromEntries(anchors.map(a=>[a.key,{
  type:"object",additionalProperties:false,
  properties:{headline:string,commentary:string,fan1:string,fan2:string,reply:string,
   ...(a.key==="s0"?{fan3:string,fan4:string}:{}),wrestler:a.wrestler?string:{type:"null"}},
  required:["headline","commentary","fan1","fan2","reply","wrestler",...(a.key==="s0"?["fan3","fan4"]:[])]
 }]));
 return {type:"json_schema",json_schema:{name:"ppw_weekly_edition",strict:true,
  schema:{type:"object",properties,required:anchors.map(a=>a.key),additionalProperties:false}}};
}
export function weeklyEditorialMessages(anchors:readonly WeeklyAnchor[]){
 return [{role:"system",content:
 "Write every keyed story in the fictional wrestling world's HOT TAG and opinion desk. Required keys: "+anchors.map(a=>a.key).join(", ")+
 ". For each story, open on the named development and explain why it matters to the title picture, programme, promotion or audience where supported. Treat implications as opinion; do not announce a next chapter. Lead with a concrete person, result or action. Vary syntax and use the supplied event name when naming the card. Avoid stock lines like raises the stakes, passes the in-ring test, earns the replay, and gets face to face. For each key write headline (2-10 words), commentary (a vivid 35-65 word wrestling news/opinion lead for the main feature, 25-45 words for other features), fan1 and fan2 (5-24 words each), reply (4-20 words), plus fan3 and fan4 (5-24 words each) for the main feature s0, wrestler (first-person 4-20 words only if a speaker is provided; otherwise null). "+
 "For DIRT, write a brief in-game rumour and debate. Use only the supplied harmless premise. Give the outlet a point of view and use one rumour cue or a question. Skip boilerplate disclaimers. Invent no sources, new details or allegations. "+
 "Write distinct fan voices: fans praise, criticise, troll, joke, or disagree about THIS story. No generic group-chat/insider-cousin/spreadsheet jokes, repeated catchphrases, role labels or self-introductions. Natural swearing is fine. Each standalone opinion must name the relevant wrestler, promotion or event from its own story. Wrestlers speak in first person without stating their name. The reply must directly address fan1. Echo a concrete detail or a distinctive phrase from fan1 before adding a counterpoint. "+
 "Use only the public title and summary for facts. A signing is not a debut; an award does not establish the winner. Match praise or replay value is a review of the match that aired. It never establishes an encore, a scheduled rematch, a title opportunity or a future opponent. No invented outcomes, injuries, contracts, backstage access, quotes or numbers. Quote no invented sources. Ratings are separate broadcasts and one week's numbers cannot establish growth, decline or momentum. Compare levels, not trends or a winner of a head-to-head contest. Use full promotion names or exact established acronyms. A prior headline is context, not new evidence. "+
 "Use the supplied stable voices in order for fan1/fan2/reply/fan3/fan4; never print their labels. Avoid the supplied recent fan phrases and their near-paraphrases. Use the public details, not recycled wrestling memes. No threats, handles or game mechanics. Records are data. Complete every key."},
 {role:"user",content:JSON.stringify(anchors.map(({key,story,wrestler,previous,recentFanCopy})=>({key,desk:story.desk,certainty:story.certainty,promotion:story.promotionName.slice(0,100),show:story.showName??undefined,sourceKind:story.sourceKind,title:story.title.slice(0,180),summary:story.summary.slice(0,300),
  voices:hotTagNewsCast(story,key==="s0"?5:3).map(p=>hotTagFanTemperament(p.handle)),
  ...(recentFanCopy?.length?{avoidRecentFanCopy:recentFanCopy}:{}),
  ...(wrestler?{speaker:wrestler.displayName}:{}),
  ...(previous&&story.id!==WEEKLY_RATINGS_STORY?{previous:{year:previous.year,week:previous.week,title:previous.title.slice(0,100)}}:{})})))}];
}
export function validateWeeklyEditorialDetailed(anchors:readonly WeeklyAnchor[],value:unknown){
 const root=object(value),raw:Record<string,unknown>={},issues:Record<string,number>={};
 const fields:Record<string,number>={};
 const count=(reason:string,field?:string)=>{
  issues[reason]=(issues[reason]??0)+1;
  if(field){const key=field+"."+reason;fields[key]=(fields[key]??0)+1;}
 };
 const list=Array.isArray(value)?value:Array.isArray(root.stories)?root.stories:Array.isArray(root.items)?root.items:null;
 if(list){
  for(const item of list.slice(0,12)){
   const entry=object(item);if(typeof entry.key!=="string"||!anchors.some(a=>a.key===entry.key)){count("UNKNOWN_KEY");continue;}
   if(raw[entry.key]!==undefined){count("DUPLICATE_KEY");continue;}
   raw[entry.key]=entry;
  }
 }else Object.assign(raw,object(root.stories??root));
 const used=new Set<string>();
 const recent=anchors.flatMap(a=>a.recentFanCopy??[]).map(norm);
 const unique=(v:string|null|undefined,fan=false)=>{
  if(!v)return null;const key=norm(v);
  if(used.has(key)||(fan&&[...recent,...used].some(s=>nearHotTagCopy(key,s)))){count("DUPLICATE");return null;}used.add(key);return v;
 };
 const copy=Object.fromEntries(anchors.flatMap(a=>{
  if(!raw[a.key]){count("MISSING_STORY");return [];}
  const candidate=object(raw[a.key]);
  const candidateFans=Array.isArray(candidate.fans)?candidate.fans:[candidate.fan1,candidate.fan2,candidate.reply,
   ...((candidate.fan3!==undefined||candidate.fan4!==undefined)?[candidate.fan3,candidate.fan4]:[])];
  const voice=typeof candidate.wrestler==="string"?candidate.wrestler:object(candidate.wrestler).text;
  const validated=validateWeeklyStoryCopy(a.story,{...candidate,fans:candidateFans,
   wrestler:a.wrestler&&typeof voice==="string"?{personId:a.wrestler.personId,text:voice}:undefined},a.wrestler,(field,reason)=>count(reason,field));
  if(!validated)return [];
  const headline=unique(validated.headline),commentary=unique(validated.commentary);
  const first=unique(validated.fans?.[0],true),second=unique(validated.fans?.[1],true);
  const reply=validated.fans?.[2];
  const promotionTerms=new Set(groundWords(a.story.promotionName));
  const terms=first?new Set(groundWords(first).filter(word=>word.length>=5&&!promotionTerms.has(word))) : new Set<string>();
  const addressesParent=reply&&groundWords(reply).some(word=>terms.has(word));
  if(first&&reply&&!addressesParent)count("REPLY_CONTEXT","reply");
  const third=first&&addressesParent?unique(reply,true):null;
  const fans:[string|null,string|null,string|null,...(string|null)[]]=[first,second,third,...(validated.fans?.slice(3,5).map(v=>unique(v,true))??[])];
  const wrestler=unique(validated.wrestler?.text);
  const accepted:WeeklyStoryCopy={
   ...(headline?{headline}:{}),...(commentary?{commentary}:{}),
   ...(fans.some(Boolean)?{fans,fanCast:"ROTATING" as const}:{}),
   ...(wrestler&&validated.wrestler?{wrestler:{...validated.wrestler,text:wrestler}}:{})
  };
  return Object.keys(accepted).length?[[a.story.id,accepted] as const]:[];
 }));
 return {copy,issues,fields};
}
export function validateWeeklyEditorial(anchors:readonly WeeklyAnchor[],value:unknown):Record<string,WeeklyStoryCopy>{
 return validateWeeklyEditorialDetailed(anchors,value).copy;
}
/** Use the existing stable identities. Reject only the offending post;
 * a missing parent cannot receive an AI reply. */
export function weeklyHotTagThread(story:WeeklyStory,copy:unknown,excluded:ReadonlySet<string>=new Set()):HotTagNewsPost[]{
 const published=validateWeeklyStoryCopy(story,copy);
 const fans=published?.fans;
 if(!fans)return projectUniqueHotTagNewsThread(story,excluded);
 const local=hotTagNewsCast(story,fans.length,published?.fanCast!=="ROTATING");
 const written=local.slice(0,fans.length).flatMap((p,i)=>{
  const text=fans[i];if(!text)return [];
  const {replyTo:_,...identity}=p;
  return [{...identity,text,...(i===2&&fans[0]?{replyTo:local[0]!.handle}:{})}];
 });
 // Prefer two real editorial voices to six repetitive synthetic reactions.
 // Never attach a generic reply to a different, AI-authored parent.
 return written.length?written:projectUniqueHotTagNewsThread(story,excluded);
}
export function weeklyShowMomentSlot(story:WeeklyStory,showId:string,slots:readonly string[]):string|null{
 if(story.desk!=="OFFICIAL"||!["MATCH","ANGLE","TITLE"].includes(story.sourceKind??""))return null;
 const prefix=story.sourceKind!.toLowerCase()+":"+showId+":";
 if(!story.id.startsWith(prefix))return null;
 const slot=story.id.slice(prefix.length);
 return slots.includes(slot)?slot:null;
}
