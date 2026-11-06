/** One World-wide, zero-sum television audience contest between certified
 * programmes airing in the same weekly day/hour window. The original PPW
 * show score, local attendance, PPV receipts and broadcaster guarantees stay
 * authoritative. No random calls, new polls or wrestler-stat shortcuts.
 */
export interface RatingsWarEpisode{
 showId:string;promotionId:string;day:number;hour:number|null;
 householdRating:number;estimatedViewers:number;crowdResponse:number;
}
export interface RatingsWarResult{
 showId:string;promotionId:string;
 householdRating:number;estimatedViewers:number;
 baseRating:number;baseViewers:number;
 opponents:number;change:number;
}
const units=(rating:number)=>Math.round(rating*10);
const safe=(x:number)=>Number.isFinite(x);
const byId=(a:{promotionId:string;showId:string},b:{promotionId:string;showId:string})=>
 a.promotionId.localeCompare(b.promotionId)||a.showId.localeCompare(b.showId);
/** Fans can switch programmes during genuinely overlapping broadcasts;
 * general league rankings from different days are NOT direct competition.
 *
 * The winner of each on-air pairing may gain up to 0.3 household rating
 * points from the loser, never more than 20% of either side's baseline
 * audience over the entire week. Equal traction means no redistribution.
 * Every tenth transferred is removed from one promotion and awarded to
 * another, keeping World-wide same-slot viewing totals honest.
 */
export function projectRatingsWarWeek(episodes:readonly RatingsWarEpisode[]):RatingsWarResult[]{
 if(episodes.length>128)throw new Error("Ratings War exceeds bounded World promotion population");
 const seen=new Set<string>();
 for(const e of episodes){
  if(typeof e.showId!=="string"||!e.showId||e.showId.length>200||
   typeof e.promotionId!=="string"||!e.promotionId||e.promotionId.length>200||
   seen.has(e.promotionId)||!Number.isSafeInteger(e.day)||e.day<1||e.day>7||
   (e.hour!==null&&(!Number.isSafeInteger(e.hour)||e.hour<0||e.hour>23))||
   !safe(e.householdRating)||e.householdRating<0||e.householdRating>10||
   Math.abs(e.householdRating*10-units(e.householdRating))>0.000001||
   !Number.isSafeInteger(e.estimatedViewers)||e.estimatedViewers<0||
   !safe(e.crowdResponse)||e.crowdResponse<0||e.crowdResponse>100)
   throw new Error("Invalid certified Ratings War episode");
  seen.add(e.promotionId);
 }
 const ordered=[...episodes].sort(byId);
 const map=new Map(ordered.map(e=>[e.promotionId,{
  episode:e,raw:units(e.householdRating),delta:0,
  losses:0,gains:0,opponents:0
 }]));
 const slots=new Map<string,typeof ordered>();
 for(const e of ordered){
  if(e.hour===null)continue; // A verified off-slot TV show cannot win a scheduled audience clash.
  const key=e.day+":"+e.hour;
  const members=slots.get(key)??[];members.push(e);slots.set(key,members);
 }
 for(const slot of slots.values()){
  if(slot.length<2)continue;
  // Signed broadcasting and chosen show-day jointly determine a clash.
  // Sorting gives the same result for every submitted-show resolution order.
  const pairs:{first:RatingsWarEpisode;second:RatingsWarEpisode;diff:number}[]=[];
  for(let i=0;i<slot.length;i++)for(let j=i+1;j<slot.length;j++){
   const a=slot[i]!,b=slot[j]!;
   const score=(e:RatingsWarEpisode)=>units(e.householdRating)*4+
    Math.round((e.crowdResponse-65)/5);
   pairs.push({first:a,second:b,diff:score(a)-score(b)});
  }
  for(const e of slot)map.get(e.promotionId)!.opponents=slot.length-1;
  pairs.sort((a,b)=>Math.abs(b.diff)-Math.abs(a.diff)||
   byId(a.first,b.first)||byId(a.second,b.second));
  for(const pair of pairs){
   if(Math.abs(pair.diff)<4)continue;
   const winning=map.get((pair.diff>0?pair.first:pair.second).promotionId)!;
   const losing=map.get((pair.diff>0?pair.second:pair.first).promotionId)!;
   const loseBudget=Math.max(0,Math.floor(losing.raw*.2))-losing.losses;
   const gainBudget=Math.max(0,Math.floor(winning.raw*.2))-winning.gains;
   const transfer=Math.min(3,Math.max(1,Math.ceil(Math.abs(pair.diff)/16)),
    loseBudget,gainBudget);
   if(transfer<=0)continue;
   losing.delta-=transfer;losing.losses+=transfer;
   winning.delta+=transfer;winning.gains+=transfer;
  }
 }
 return ordered.map(e=>{
  const result=map.get(e.promotionId)!;
  const adjusted=result.raw+result.delta;
  // Preserve the baseline show's existing TV-household-to-viewer model,
  // rather than inventing new viewers from the rounded displayed rating.
  const viewers=result.raw===0?e.estimatedViewers:
   Math.round((e.estimatedViewers*adjusted/result.raw)/1000)*1000;
  return {showId:e.showId,promotionId:e.promotionId,
   householdRating:adjusted/10,estimatedViewers:viewers,
   baseRating:e.householdRating,baseViewers:e.estimatedViewers,
   opponents:result.opponents,change:result.delta/10};
 });
}
