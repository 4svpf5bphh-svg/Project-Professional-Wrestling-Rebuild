import type {WorldNewsStory} from "../db/world-news.js";
export type Veracity="SUBSTANTIATED"|"DISTORTED"|"FABRICATED";
export interface RumourCase extends Record<string,unknown>{
 case_key:string;origin_week_index:number;last_followup_week_index:number|null;
 chapter:number;veracity:Veracity;promotion_id:string;promotion_name:string;
 show_id:string;headline:string
}
export function rumourCaseVeracity(key:string):Veracity{
 let h=2166136261;for(const c of key){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return (["SUBSTANTIATED","DISTORTED","FABRICATED"] as const)[(h>>>0)%3]!;
}
export function canFollowRumour(key:string):boolean{
 return /^rumour:(?:title|angle|breakout):/.test(key);
}
export function publicRumourDevelopment(c:RumourCase,stories:readonly WorldNewsStory[]):WorldNewsStory|undefined{
 const sourceKind=c.case_key.startsWith("rumour:title:")?"TITLE":
  c.case_key.startsWith("rumour:angle:")?"ANGLE":
  c.case_key.startsWith("rumour:breakout:")?"MATCH":null;
 if(!sourceKind)return undefined;
 // New pitches name their subject in the headline. Match contiguous name
 // phrases to a later public story, using only the same promotion and desk.
 const subject=c.headline.match(/^(?:How far will )(.+?) take the champion/i)?.[1]??
  c.headline.match(/^(.+?) have the theory merchants/i)?.[1]??
  c.headline.match(/^Is (.+?) getting a major push/i)?.[1];
 if(!subject)return undefined;
 const normalize=(s:string)=>" "+s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim()+" ";
 return stories.find(s=>s.desk==="OFFICIAL"&&s.certainty==="CONFIRMED"&&
  s.promotionId===c.promotion_id&&s.showId!==c.show_id&&s.sourceKind===sourceKind&&
  subject.split(/ and /i).some(name=>normalize(s.title+" "+s.summary).includes(normalize(name))));
}
export function rumourFollowup(c:RumourCase,year:number,week:number,evidence:WorldNewsStory):WorldNewsStory{
 const final=c.chapter>0;
 const title=final?"The gossip desk revisits "+evidence.promotionName:
  "A fresh twist for the "+evidence.promotionName+" rumour mill";
 // Earlier rows retain their legacy classification. Only the public
 // development and number of times the desk revisited the story shape copy.
 const angle=final?
  "The desk is retiring its earlier theory. The latest story stands on its own.":
  "The new result gives readers something to discuss. The earlier theory is still speculation.";
 return {key:"followup:"+c.case_key+":"+year+":"+week,desk:"DIRT",
  certainty:"SPECULATION",promotionId:c.promotion_id,promotionName:c.promotion_name,
  showId:evidence.showId,sourceKind:evidence.sourceKind,title,
  summary:("The earlier rumour: "+c.headline+" Now: "+evidence.title+". "+angle).slice(0,600)};
}
