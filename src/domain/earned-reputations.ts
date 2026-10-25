
/** Reputations earned from completed records, never fame or user-assigned
 * stats. Current-form labels may fade as new certified results arrive.
 */
export type EarnedReputationId=
 "BIG_MATCH_PERFORMER"|"TAG_SPECIALIST"|"HOT_STREAK"|"CHAMPIONSHIP_VETERAN";
export interface EarnedReputation{
 id:EarnedReputationId;name:string;evidence:string;
}
export interface ReputationEvidence{
 summary:{matches:number;tag:number;ratedMatches:number;
  averageStars:number|null;bestStars:number|null};
 recent:readonly {won:boolean;format:"SINGLES"|"TAG";stars:number|null}[];
 singlesTitles:readonly {defenses:number}[];
}
export function earnedWrestlerReputations(career:ReputationEvidence):EarnedReputation[]{
 const {summary,recent,singlesTitles}=career;
 const found:EarnedReputation[]=[];
 const lastEight=recent.slice(0,8);
 const exceptional=recent.slice(0,12)
  .filter(x=>x.stars!==null&&x.stars>=4);
 if(summary.ratedMatches>=12&&summary.averageStars!==null&&
  summary.averageStars>=3.6&&summary.bestStars!==null&&
  summary.bestStars>=4.2&&exceptional.length>=2)
  found.push({id:"BIG_MATCH_PERFORMER",name:"Big Match Performer",
   evidence:"12+ rated bouts · career average at least 3.6★ · two recent 4★ matches"});
 if(summary.matches>=16&&summary.tag>=12&&
  summary.tag/summary.matches>=.6&&
  lastEight.filter(x=>x.format==="TAG").length>=4)
  found.push({id:"TAG_SPECIALIST",name:"Tag Specialist",
   evidence:summary.tag+" verified tag matches · recent appearances still favour teams"});
 if(recent.length>=4&&recent.slice(0,4).every(x=>x.won))
  found.push({id:"HOT_STREAK",name:"On a Roll",
   evidence:"Four consecutive verified match victories"});
 if(singlesTitles.length>=2&&
  singlesTitles.reduce((n,t)=>n+t.defenses,0)>=4)
  found.push({id:"CHAMPIONSHIP_VETERAN",name:"Championship Veteran",
   evidence:"Multiple recorded singles reigns · at least four successful defences"});
 return found;
}
