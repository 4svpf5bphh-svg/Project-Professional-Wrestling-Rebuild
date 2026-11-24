
import {projectHotTagNewsThread,type HotTagNewsStory,type HotTagNewsPost} from "./hot-tag-news.js";
export type WeeklyStory = HotTagNewsStory & {certainty:"CONFIRMED"|"SPECULATION"};
export type WeeklyStoryCopy = {headline?:string;commentary?:string;fans?:[string,string,string]};
export type WeeklyAnchor={key:string;story:WeeklyStory};
const norm=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{};
const factClaim=/\b(?:won|wins|lost|loses|defeated|pinned|submitted|retained|retains|injur(?:y|ies|ed)|concussion|hospital|fractur\w*|fired|signed|released|suspended|arrested|dead|died|insider|sources?|leak\w*|confirmed|officially|booked|scheduled|announced|guaranteed|attacked|blood|bleed\w*)\b/i;
const forbidden=/\b(?:certified|simulation|game engine|player controlled|ai generated|prompt|slot id|kill yourself|go die|death threat)\b|https?:|@[a-z0-9_]|[<>"\u0000-\u001f]/i;
const opinion=/\b(?:i|my|we|our|think|love|hate|want|prefer|hope|wish|deserv\w*|should|could|would|better|worse|great|brilliant|awful|ridiculous|boring|perfect|shame|seriously|please|imagine|fair|unfair|why|really|good|bad|come on|nah|nope|lol|lmao|hell|fuck|shit|damn|ffs|cry|cope|worth|question|wait)\b/i;
function bounded(v:unknown,story:WeeklyStory,min:number,max:number,chars:number,ground:boolean){
 if(typeof v!=="string"||v.length>chars||forbidden.test(v)||factClaim.test(v))return undefined;
 const text=v.trim(),words=text.split(/\s+/).length;
 if(words<min||words>max||!opinion.test(text))return undefined;
 // No invented scores, dates, contracts, or other numeric detail.
 const source=story.title+" "+story.summary+" "+story.promotionName;
 if((text.match(/\d+(?:\.\d+)?/g)??[]).some(n=>!(source.match(/\d+(?:\.\d+)?/g)??[]).includes(n)))return undefined;
 if(ground){
  const hay=" "+norm(text)+" ",name=norm(story.promotionName);
  const titleWords=norm(story.title).split(" ").filter(w=>w.length>=5&&!["wrestling","championship","promotion","against","weekly","reports","match","could","would","after","their","world"].includes(w));
  if(!(name&&hay.includes(" "+name+" "))&&!titleWords.some(w=>hay.includes(" "+w+" ")))return undefined;
 }
 return text;
}
export function validateWeeklyStoryCopy(story:WeeklyStory,value:unknown):WeeklyStoryCopy|null{
 const raw=object(value);
 const headline=bounded(raw.headline,story,3,13,110,true);
 const commentary=bounded(raw.commentary,story,8,40,260,true);
 const fans=Array.isArray(raw.fans)&&raw.fans.length===3?
  [bounded(raw.fans[0],story,5,29,190,true),bounded(raw.fans[1],story,5,29,190,true),
   bounded(raw.fans[2],story,5,29,190,false)]:[];
 const unique=new Set(fans.map(f=>f&&norm(f)));
 const thread=fans.length===3&&fans.every(Boolean)&&unique.size===3?fans as [string,string,string]:undefined;
 const copy:WeeklyStoryCopy={...(headline&&commentary?{headline,commentary}:{}),...(thread?{fans:thread}:{})};
 return Object.keys(copy).length?copy:null;
}
export function weeklyEditorialAnchors(stories:readonly WeeklyStory[]):WeeklyAnchor[]{
 const selected:WeeklyStory[]=[];
 const add=(s:WeeklyStory|undefined)=>{if(s&&!selected.some(x=>x.id===s.id))selected.push(s);};
 // Give the desks different subjects and prefer a ratings/business story when present.
 add(stories.find(s=>s.desk==="OFFICIAL"&&s.id.startsWith("broadcast:")));
 add(stories.find(s=>s.desk==="DIRT"));
 add(stories.find(s=>s.desk==="OFFICIAL"&&!selected.some(x=>x.promotionId===s.promotionId)));
 for(const story of stories){if(selected.length>=3)break;add(story);}
 return selected.slice(0,3).map((story,i)=>({key:"s"+i,story}));
}
export function weeklyEditorialMessages(anchors:readonly WeeklyAnchor[]){
 return [{role:"system",content:"You write the fictional PPW wrestling world's public editorial and HOT TAG fan opinions, not events. Only the supplied public source is evidence. OFFICIAL facts are already printed; DIRT is unverified and must stay hypothetical. No new facts, names, results, injuries, deals, quotations, dates or numbers. Do not repeat the source. For each key return JSON {headline,commentary,fans:[fan1,fan2,replyToFan1]}. Headline is an opinion, 3-13 words; commentary 8-40 words; fans 5-29 words each. Headline, commentary, fan1 and fan2 must mention the exact promotion name or a distinctive word from the title. Fans should have genuinely different viewpoints: knowledgeable, sarcastic, impatient, funny; occasional wrestling-appropriate swearing is welcome. Reply directly to fan1. Use opinion language like I think, should, could, why, hope, better. No result claims or claims of inside knowledge. Omit any field you cannot safely write. JSON object keyed by source key only."},
 {role:"user",content:JSON.stringify(anchors.map(({key,story})=>({key,desk:story.desk,certainty:story.certainty,promotion:story.promotionName.slice(0,100),title:story.title.slice(0,180),summary:story.summary.slice(0,360)})))}];
}
export function validateWeeklyEditorial(anchors:readonly WeeklyAnchor[],value:unknown):Record<string,WeeklyStoryCopy>{
 const raw=object(value);
 return Object.fromEntries(anchors.flatMap(a=>{
  const copy=validateWeeklyStoryCopy(a.story,raw[a.key]);
  return copy?[[a.story.id,copy] as const]:[];
 }));
}
/** Stable existing handles and metrics; entire accepted three-person thread or local fallback. */
export function weeklyHotTagThread(story:WeeklyStory,copy:unknown):HotTagNewsPost[]{
 const local=projectHotTagNewsThread(story),fans=validateWeeklyStoryCopy(story,copy)?.fans;
 if(!fans||local.length<3)return local;
 return local.slice(0,3).map((p,i)=>{
  const {replyTo:_,...identity}=p;
  return {...identity,text:fans[i]!,...(i===2?{replyTo:local[0]!.handle}:{})};
 });
}
