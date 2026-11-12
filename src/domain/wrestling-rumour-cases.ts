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
 // Veracity labels are legacy editorial-arc states, not evidence that a
 // private locker-room incident happened. Even a second anonymous tip is
 // still gossip. Keep backstage allegations in the voice of an actual outlet.
 const summaries=final?
  {SUBSTANTIATED:"A second account has echoed the earlier allegation, but the descriptions still clash and nobody involved has gone on the record. The publication has not established what, if anything, happened backstage.",
   DISTORTED:"The first headline was emphatic. The follow-ups have been much less so. The supposed walkout and physical confrontation remain unsupported, and the publication is now questioning how the story was framed.",
   FABRICATED:"The outlet has withdrawn its original locker-room report after its tip could not be corroborated. Its editor has apologised for running the claim. The story now is how the paper got it so wrong."}:
  {SUBSTANTIATED:"Another unnamed tipster has repeated part of the locker-room story, while disagreeing with key details. More whispers are not the same as evidence, and no participant has confirmed the account.",
   DISTORTED:"One tip described an explosive argument. A competing account says the headline exaggerated a mundane exchange. Neither version has been established, but the rumour is drawing plenty of attention.",
   FABRICATED:"Other wrestling reporters have challenged the alleged source behind the original scoop. The journalist has yet to offer anything that backs up the claim, and rival outlets are asking uncomfortable questions."};
 return {key:"followup:"+c.case_key+":"+year+":"+week,desk:"DIRT",
  certainty:"SPECULATION",promotionId:c.promotion_id,promotionName:c.promotion_name,
  showId:c.show_id,sourceKind:"EVENT",title:titles[truth],
  summary:("FOLLOWING UP: "+c.headline+". "+summaries[truth]).slice(0,600)};
}
