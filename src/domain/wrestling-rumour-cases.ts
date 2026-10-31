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
export function rumourFollowup(c:RumourCase,year:number,week:number):WorldNewsStory{
 const final=c.chapter>0,truth=c.veracity;
 const titles=final?
  {SUBSTANTIATED:"More backstage accounts emerge, but the details remain disputed",
   DISTORTED:"Earlier backstage claims appear to have been exaggerated",
   FABRICATED:"Dirt sheet retracts controversial locker-room story"}:
  {SUBSTANTIATED:"A second backstage account supports an earlier rumour",
   DISTORTED:"A competing locker-room source challenges the sensational claims",
   FABRICATED:"Reporter challenged to identify the source behind backstage allegations"};
 const summaries=final?
  {SUBSTANTIATED:"More than one fictional source now alleges genuine backstage tension behind the report, but no official record establishes who said what. The original show results are unchanged.",
   DISTORTED:"A routine exchange appears to have grown into a much bigger story than anything that happened. Claims of a dramatic walkout or physical fight were not substantiated. The wrestling internet may never agree.",
   FABRICATED:"The publication has withdrawn the original backstage report after its supposed source failed to hold up to scrutiny. The alleged incident was invented, not a certified event. Fans have questions for the reporter."}:
  {SUBSTANTIATED:"An additional uncredited source now alleges some tension behind the curtain, though their account contradicts key details of the original story. No official report confirms the allegation.",
   DISTORTED:"One account called the incident a serious dispute. Another says an entirely routine conversation was turned into a headline. Nothing has been independently confirmed.",
   FABRICATED:"Other reporters say they cannot corroborate the initial anonymous tip and question whether the source exists. For now the dramatic account remains completely unverified."};
 return {key:"followup:"+c.case_key+":"+year+":"+week,desk:"DIRT",
  certainty:"SPECULATION",promotionId:c.promotion_id,promotionName:c.promotion_name,
  showId:c.show_id,sourceKind:"EVENT",title:titles[truth],
  summary:("FOLLOWING UP: "+c.headline+". "+summaries[truth]).slice(0,600)};
}
