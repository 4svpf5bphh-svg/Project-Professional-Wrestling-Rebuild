/** Feud crowd trend is derived from certified chapter reactions already
 * loaded with Programme history. This is NOT an independent popularity or
 * rivalry heat score. Compare distinct recorded weeks; multiple chapters on
 * the same night are one combined week, not invented week-to-week progress.
 */
export interface CertifiedProgrammeChapter{
 weekIndex:number;crowdResponse:number;
}
export interface ProgrammeCrowdTrend{
 weekIndex:number;latestCrowd:number;priorWeekIndex:number|null;
 priorCrowd:number|null;delta:number|null;direction:"RISING"|"STEADY"|"COOLING"|"FIRST";
}
export function readProgrammeCrowdTrend(
 chapters:readonly CertifiedProgrammeChapter[],
):ProgrammeCrowdTrend|null{
 if(chapters.length>500)throw new Error("Programme chapter trend exceeds capacity");
 const byWeek=new Map<number,{total:number;count:number}>();
 for(const entry of chapters){
  if(!Number.isSafeInteger(entry.weekIndex)||entry.weekIndex<0||
    !Number.isFinite(entry.crowdResponse)||entry.crowdResponse<0||
    entry.crowdResponse>100)throw new Error("Invalid certified programme chapter");
  const row=byWeek.get(entry.weekIndex)??{total:0,count:0};
  row.total+=entry.crowdResponse;row.count++;byWeek.set(entry.weekIndex,row);
 }
 const weeks=[...byWeek].sort(([a],[b])=>b-a);
 if(!weeks.length)return null;
 const newest=weeks[0]!,prior=weeks[1];
 const weekIndex=newest[0],latest=newest[1];
 const latestCrowd=Math.round(latest.total/latest.count);
 if(!prior)return {weekIndex,latestCrowd,priorWeekIndex:null,
  priorCrowd:null,delta:null,direction:"FIRST"};
 const priorCrowd=Math.round(prior[1].total/prior[1].count);
 const delta=latestCrowd-priorCrowd;
 return {weekIndex,latestCrowd,priorWeekIndex:prior[0],priorCrowd,delta,
  direction:delta>=6?"RISING":delta<=-6?"COOLING":"STEADY"};
}
