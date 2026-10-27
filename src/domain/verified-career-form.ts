/** Career form is an editorial reading of the most recent *certified*
 * completed match rows, never a projected attribute or an earned stat.
 * Career records already deliver twelve completed matches on demand; no
 * extra SQL, simulation mutation, or private opponent information is needed.
 */
export type VerifiedCareerFormMatch={
 won:boolean;stars:number|null;format:"SINGLES"|"TAG";
 year:number;week:number;
};
export type CareerFormSnapshot={
 recentCount:number;wins:number;losses:number;
 sequence:readonly ("W"|"L")[];
 /** Time-limited editorial classification from certified match reception. */
 breakoutRun:boolean;
 currentRun:{result:"W"|"L";length:number}|null;
 ratingTrend:null|{
  recentAverage:number;previousAverage:number;delta:number;
  recentRated:number;previousRated:number;
  direction:"HIGHER"|"LOWER"|"SIMILAR";
 };
 note:string;
};
export function verifiedCareerForm(
 recent:readonly VerifiedCareerFormMatch[]):CareerFormSnapshot{
 const latest=recent.slice(0,12);
 if(latest.some(x=>typeof x.won!=="boolean"||
  !Number.isSafeInteger(x.year)||x.year<1||
  !Number.isSafeInteger(x.week)||x.week<1||x.week>52||
  !["SINGLES","TAG"].includes(x.format)||
  (x.stars!==null&&(!Number.isFinite(x.stars)||x.stars<0||x.stars>5))))
  throw new Error("Career form needs verified match evidence");
 // Career service guarantees newest-first ordering, but it is not our job
 // to guess form from a partially sorted or stale client-side record.
 for(let i=1;i<latest.length;i++)
  if((latest[i]!.year-1)*52+latest[i]!.week>
   (latest[i-1]!.year-1)*52+latest[i-1]!.week)
   throw new Error("Career history is not in newest-first order");
 const lastFive=latest.slice(0,5);
 const sequence=lastFive.map(x=>x.won?"W" as const:"L" as const);
 const wins=lastFive.filter(x=>x.won).length;
 const first=latest[0];
 const run=first?latest.findIndex(x=>x.won!==first.won):-1;
 const currentRun=first?{result:first.won?"W" as const:"L" as const,
  length:run===-1?latest.length:run}:null;
 // Never claim a four-match rating trend from a single rated match,
 // fill in absent star scores, or compare career-long and recent metrics.
 const window=(items:readonly VerifiedCareerFormMatch[])=>{
  const ratings=items.flatMap(x=>x.stars===null?[]:[x.stars]);
  return {rated:ratings.length,average:ratings.length?
   ratings.reduce((a,v)=>a+v,0)/ratings.length:0};
 };
 const lastFour=window(latest.slice(0,4));
 const beforeFour=window(latest.slice(4,8));
 let ratingTrend:CareerFormSnapshot["ratingTrend"]=null;
 if(latest.length>=8&&lastFour.rated>=3&&beforeFour.rated>=3){
  const delta=Math.round((lastFour.average-beforeFour.average)*100)/100;
  ratingTrend={
   recentAverage:Math.round(lastFour.average*100)/100,
   previousAverage:Math.round(beforeFour.average*100)/100,
   delta,recentRated:lastFour.rated,previousRated:beforeFour.rated,
   direction:delta>=.3?"HIGHER":delta<=-.3?"LOWER":"SIMILAR"
  };
 }
 const note=!latest.length?"No certified matches are recorded yet.":
  latest.length<5?"Early form: only "+latest.length+" verified match"+
   (latest.length===1?" is":"es are")+" on record.":
  "These are completed match results, not a change in ability or a prediction.";
 // A breakout *run of match reception* needs both four-match windows,
 // not merely an isolated classic or presumed improvement in personal skill.
 const breakoutRun=ratingTrend!==null&&ratingTrend.direction==="HIGHER"&&
  ratingTrend.recentAverage>=4.1&&ratingTrend.previousAverage<=3.5&&
  ratingTrend.delta>=.75;
 return {recentCount:lastFive.length,wins,losses:lastFive.length-wins,
  sequence,currentRun,ratingTrend,breakoutRun,note};
}
