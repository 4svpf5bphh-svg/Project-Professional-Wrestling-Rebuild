/** Original PPW programme-signals.ts, adapted to bounded completed show rows.
 * Ten-week heat, eight-week repeated-content pressure and six-week density.
 * No invented story consequences and no World JSON hydration.
 */
export interface ResolvedProgrammeActivity{
 programmeId:string;weekIndex:number;signature:string;impact:number;
}
export interface ProgrammeSignal{
 heat:number|null;repetition:number;recentActivityCount:number;
 latestActivityAgeWeeks:number|null;
}
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const round2=(n:number)=>Math.round(n*100)/100;
const recency=(age:number,window:number)=>age<0||age>=window?0:(window-age)/window;
export function evaluateProgrammeSignals(
 activities:readonly ResolvedProgrammeActivity[],currentWeekIndex:number,
):ProgrammeSignal{
 if(!Number.isSafeInteger(currentWeekIndex)||currentWeekIndex<0||
  activities.length>4000)throw new Error("Invalid programme signal window");
 if(!activities.length)return {heat:null,repetition:0,recentActivityCount:0,
  latestActivityAgeWeeks:null};
 const ages=activities.map(a=>{
  if(!a.programmeId||!a.signature||a.signature.length>1200||
   !Number.isSafeInteger(a.weekIndex)||a.weekIndex<0||a.weekIndex>currentWeekIndex||
   !Number.isFinite(a.impact)||a.impact<0||a.impact>100)
   throw new Error("Invalid completed programme activity");
  return {activity:a,age:currentWeekIndex-a.weekIndex};
 });
 const latest=Math.min(...ages.map(x=>x.age));
 const repeated=ages.filter(x=>x.age<8).sort((a,b)=>b.age-a.age);
 const seen=new Map<string,number>();
 let repeatPressure=0;
 for(const {activity,age} of repeated){
  const prior=seen.get(activity.signature)??0;
  if(prior>0)repeatPressure+=14*recency(age,8);
  seen.set(activity.signature,prior+1);
 }
 const density=ages.filter(x=>x.age<6);
 const activeWeeks=new Set(density.map(x=>x.activity.weekIndex));
 const currentCount=density.filter(x=>x.age===0).length;
 const repetition=clamp(repeatPressure+
  Math.max(0,activeWeeks.size-2)*5+
  Math.max(0,currentCount-1)*6,0,100);
 const recent=ages.filter(x=>x.age<10);
 let weight=0,total=0;
 for(const {activity,age} of recent){
  const w=recency(age,10);weight+=w;total+=activity.impact*w;
 }
 if(weight===0)return {heat:10,repetition:0,recentActivityCount:0,
  latestActivityAgeWeeks:latest};
 const bonus=Math.min(14,weight*4);
 const inactivity=latest<=1?0:Math.min(30,(latest-1)*5);
 const heat=clamp(15+(total/weight)*.62+bonus-repetition*.27-inactivity,0,100);
 return {heat:round2(heat),repetition:round2(repetition),
  recentActivityCount:recent.length,latestActivityAgeWeeks:latest};
}
