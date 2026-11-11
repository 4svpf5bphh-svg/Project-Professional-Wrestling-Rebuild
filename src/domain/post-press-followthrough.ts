/** The following week's news can revisit a PPV press scrum ONLY after
 * another completed broadcast produces its own publishable on-air headline.
 * We never turn old press words into a private plan or invented promise.
 * Pure composition: no AI, persistence or new on-demand feed reads.
 */
import type {WorldNewsStory} from "../db/world-news.js";

export interface PublicPressReceipt {
 year:number;week:number;promotionId:string;showId:string;title:string;
}
export interface CurrentCertifiedBroadcast{
 showId:string;promotionId:string;promotionName:string;showName:string;
}
const index=(year:number,week:number)=>(year-1)*52+week-1;
const rank=(kind:WorldNewsStory["sourceKind"])=>kind==="TITLE"?0:
 kind==="ANGLE"?1:kind==="MATCH"?2:kind==="EVENT"?3:9;
function shortKey(s:string){
 let value=2166136261;
 for(const ch of s){value^=ch.charCodeAt(0);value=Math.imul(value,16777619);}
 return (value>>>0).toString(36);
}
const limited=(s:string,n:number)=>s.length>n?s.slice(0,n-1).trimEnd()+"…":s;
export function composePostPressFollowthrough(input:{
 year:number;week:number;previousPress:readonly PublicPressReceipt[];
 currentShows:readonly CurrentCertifiedBroadcast[];
 publishedStories:readonly WorldNewsStory[];
}):WorldNewsStory[]{
 if(!Number.isSafeInteger(input.year)||input.year<1||
  !Number.isSafeInteger(input.week)||input.week<1||input.week>52)return [];
 const now=index(input.year,input.week),seen=new Set<string>();
 const previous=[...input.previousPress].filter(p=>
  Number.isSafeInteger(p.year)&&Number.isSafeInteger(p.week)&&p.week>=1&&
  p.week<=52&&now-index(p.year,p.week)===1&&
  p.showId&&p.promotionId&&p.title).sort((a,b)=>
   a.promotionId.localeCompare(b.promotionId)||a.showId.localeCompare(b.showId));
 const events=[...input.publishedStories].filter(s=>
  s.desk==="OFFICIAL"&&s.certainty==="CONFIRMED"&&
  rank(s.sourceKind)<9).sort((a,b)=>rank(a.sourceKind)-rank(b.sourceKind)||
   a.key.localeCompare(b.key));
 const output:WorldNewsStory[]=[];
 for(const old of previous){
  if(seen.has(old.promotionId))continue;
  const evidence=events.find(s=>s.promotionId===old.promotionId&&
   s.showId!==old.showId&&input.currentShows.some(show=>
    show.promotionId===s.promotionId&&show.showId===s.showId));
  if(!evidence)continue;
  const show=input.currentShows.find(s=>s.showId===evidence.showId&&
   s.promotionId===old.promotionId)!;
  const mode=/ends the press conference without taking questions/i.test(old.title)?
   "SKIPPED":/says no comment/i.test(old.title)?"DECLINED":
   /keeps details close/i.test(old.title)?"EVASIVE":"DIRECT";
  const context=mode==="SKIPPED"?
   "The previous press conference ended without questions being taken.":
   mode==="DECLINED"?
   "The previous press conference ended with an on-record no comment.":
   mode==="EVASIVE"?
   "Management kept its plans close at the previous press conference.":
   "Management spoke to reporters following the previous premium event.";
  const summary=context+" This week, "+show.promotionName+"'s "+
   show.showName+" brought a new on-air headline: "+evidence.title+
   ". That is what viewers actually saw; no future match or backstage decision was announced by the earlier press report.";
  output.push({key:"press:followup:"+shortKey(old.showId+":"+show.showId),
   desk:"OFFICIAL",certainty:"CONFIRMED",sourceKind:"EVENT",
   promotionId:show.promotionId,promotionName:show.promotionName,showId:show.showId,
   title:limited(show.promotionName+" returns to the ring after press scrutiny",240),
   summary:limited(summary,600)});
  seen.add(old.promotionId);
  if(output.length===2)break; // A real two-manager World; no media spam.
 }
 return output;
}
