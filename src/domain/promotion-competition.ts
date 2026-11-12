/** One stable circuit rival per promotion, selected from PUBLIC company
 * performance, not human-only knowledge or planned cards.
 * No AI calls, World snapshots, private contracts or hidden wrestling results.
 */
export interface CompetitionCandidate{
 promotionId:string;tier:string;mediaReach:number|null;
 homeMarketId:string|null;humanManaged:boolean;
 completedShows:number;averageCrowd:number|null;
 averageAttendance:number|null;averageTvRating:number|null;
 previousRivalId:string|null;previousSinceWeekIndex:number|null;
}
export interface CompetitionSelection{
 promotionId:string;rivalId:string|null;nextTargetId:string|null;
 sinceWeekIndex:number;ownShows:number;rivalShows:number;
 ownCrowd:number|null;rivalCrowd:number|null;
 ownAttendance:number|null;rivalAttendance:number|null;
 ownReach:number|null;rivalReach:number|null;
 ownTvRating:number|null;rivalTvRating:number|null;
 changed:boolean;
}
const tierOrder:Readonly<Record<string,number>>={
 LOCAL:0,REGIONAL:1,INDEPENDENT:1,RISING:2,NATIONAL:3,GLOBAL:4
};
const rank=(tier:string)=>tierOrder[tier]??0;
function score(own:CompetitionCandidate,other:CompetitionCandidate):number{
 const gap=Math.abs(rank(own.tier)-rank(other.tier));
 const reachDiff=Math.abs((own.mediaReach??0)-(other.mediaReach??0));
 const market=own.homeMarketId!==null&&own.homeMarketId===other.homeMarketId;
 const crowd=own.averageCrowd!==null&&other.averageCrowd!==null?
  Math.max(0,10-Math.abs(own.averageCrowd-other.averageCrowd)/5):0;
 const attendance=own.averageAttendance!==null&&other.averageAttendance!==null?
  Math.max(0,12-Math.abs(own.averageAttendance-other.averageAttendance)/
   Math.max(100,Math.max(own.averageAttendance,other.averageAttendance)) *20):0;
 const tv=own.averageTvRating!==null&&other.averageTvRating!==null?
  Math.max(0,10-Math.abs(own.averageTvRating-other.averageTvRating)*4):0;
 // Comparable humans should naturally meet on the local circuit, but a
 // stronger AI competitor can displace them if the companies diverge.
 return 115-gap*33-Math.min(26,reachDiff/3)+
  (market?19:0)+(other.humanManaged?(gap===0?25:10):0)+
  crowd+attendance+tv+Math.min(5,other.completedShows);
}
export function selectPromotionCompetition(
 companies:readonly CompetitionCandidate[],weekIndex:number
):CompetitionSelection[]{
 if(companies.length>128||!Number.isSafeInteger(weekIndex)||weekIndex<0)
  throw new Error("Invalid bounded World competition review");
 const all=[...companies].sort((a,b)=>a.promotionId.localeCompare(b.promotionId));
 if(new Set(all.map(x=>x.promotionId)).size!==all.length)
  throw new Error("Duplicate promotion in competition review");
 return all.map(own=>{
  const other=all.filter(c=>c.promotionId!==own.promotionId);
  const rated=other.map(candidate=>({candidate,score:score(own,candidate)}))
   .sort((a,b)=>b.score-a.score||
    a.candidate.promotionId.localeCompare(b.candidate.promotionId));
  const top=rated[0]??null;
  const incumbent=rated.find(c=>c.candidate.promotionId===own.previousRivalId);
  // A clear new leader is required. This prevents monthly flip-flopping.
  const selected=incumbent&&top&&incumbent.score>=top.score-14?
   incumbent.candidate:top?.candidate??null;
  const higher=other.filter(c=>
   (rank(c.tier)>rank(own.tier)||
    (rank(c.tier)===rank(own.tier)&&
     (c.mediaReach??0)>(own.mediaReach??0)+8))&&
   rank(c.tier)-rank(own.tier)<=2)
   .sort((a,b)=>rank(a.tier)-rank(b.tier)||
    (a.mediaReach??0)-(b.mediaReach??0)||
    a.promotionId.localeCompare(b.promotionId))[0]??null;
  const changed=(selected?.promotionId??null)!==own.previousRivalId;
  return {
   promotionId:own.promotionId,rivalId:selected?.promotionId??null,
   nextTargetId:higher?.promotionId??null,
   sinceWeekIndex:changed?weekIndex:own.previousSinceWeekIndex??weekIndex,
   ownShows:own.completedShows,rivalShows:selected?.completedShows??0,
   ownCrowd:own.averageCrowd,rivalCrowd:selected?.averageCrowd??null,
   ownAttendance:own.averageAttendance,
   rivalAttendance:selected?.averageAttendance??null,
   ownReach:own.mediaReach,rivalReach:selected?.mediaReach??null,
   ownTvRating:own.averageTvRating,rivalTvRating:selected?.averageTvRating??null,
   changed
  };
 });
}
