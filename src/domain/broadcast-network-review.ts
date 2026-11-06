/** Partner obligations from certified episodes, not private booking plans.
 * Guaranteed weekly pay remains in force; only performance bonuses and the
 * broadcaster's published opinion respond to delivery and ratings.
 */
import {broadcasterRatingTarget,COMMERCIAL_COMPANIES} from "./commercial-offers.js";
export type BroadcastDelivery="ON_TARGET"|"WATCH"|"BELOW_TARGET"|"OFF_SLOT"|"NO_TV"|"LEGACY";
export type BroadcastMilestone="WARNING"|"FINAL_WARNING"|"RECOVERED"|null;
export interface BroadcastNetworkTerms{
 dealId:string;offerCode:string;tier:string;startWeekIndex:number;endWeekIndex:number;
 airingDay:number|null;airingHour:number|null;
}
export interface CertifiedNetworkWeek{
 weekIndex:number;showId:string;showDay:number|null;
 audienceFormat:"TV"|"PPV"|null;rating:number|null;
}
export interface BroadcastNetworkReview{
 dealId:string;offerCode:string;reviewWeekIndex:number;
 target:number;rating:number|null;showId:string|null;status:BroadcastDelivery;
 missedConsecutively:number;previousMisses:number;milestone:BroadcastMilestone;
 bonusEligible:boolean;
}
const missed=(s:BroadcastDelivery)=>s==="BELOW_TARGET"||s==="OFF_SLOT"||s==="NO_TV";
function delivery(terms:BroadcastNetworkTerms,e:CertifiedNetworkWeek|undefined,
 target:number):BroadcastDelivery{
 if(!e||e.audienceFormat==="PPV")return "NO_TV";
 if(terms.airingDay!==null&&e.showDay!==terms.airingDay)return "OFF_SLOT";
 if(e.audienceFormat===null||e.rating===null)return "LEGACY";
 if(e.rating<target*.8-1e-9)return "BELOW_TARGET";
 return e.rating<target-1e-9?"WATCH":"ON_TARGET";
}
export function assessBroadcastNetwork(terms:BroadcastNetworkTerms,
 episodes:readonly CertifiedNetworkWeek[],reviewWeekIndex:number):BroadcastNetworkReview|null{
 if(!terms.dealId||!terms.offerCode||
  !Number.isSafeInteger(reviewWeekIndex)||reviewWeekIndex<0||
  !Number.isSafeInteger(terms.startWeekIndex)||
  !Number.isSafeInteger(terms.endWeekIndex)||
  terms.startWeekIndex>terms.endWeekIndex||
  (terms.airingDay!==null&&(!Number.isInteger(terms.airingDay)||
   terms.airingDay<1||terms.airingDay>7))||
  (terms.airingHour!==null&&(!Number.isInteger(terms.airingHour)||
   terms.airingHour<0||terms.airingHour>23)))
  throw new Error("Invalid broadcast obligations");
 if(reviewWeekIndex<terms.startWeekIndex||reviewWeekIndex>terms.endWeekIndex)return null;
 const target=broadcasterRatingTarget(terms.offerCode,terms.tier);
 const evidence=new Map<number,CertifiedNetworkWeek>();
 for(const e of episodes){
  if(!Number.isSafeInteger(e.weekIndex)||!e.showId||
   e.showId.length>200||e.weekIndex<terms.startWeekIndex||
   e.weekIndex>reviewWeekIndex||e.weekIndex<reviewWeekIndex-4||
   (e.showDay!==null&&(!Number.isInteger(e.showDay)||
    e.showDay<1||e.showDay>7))||
   (e.rating!==null&&(!Number.isFinite(e.rating)||e.rating<0||e.rating>10))||
   evidence.has(e.weekIndex))throw new Error("Invalid or duplicate certified network evidence");
  evidence.set(e.weekIndex,e);
 }
 const streak=(at:number)=>{
  let n=0;
  for(let w=at;w>=Math.max(terms.startWeekIndex,at-4);w--){
   if(!missed(delivery(terms,evidence.get(w),target)))break;
   n++;
  }
  return n;
 };
 const current=evidence.get(reviewWeekIndex);
 const status=delivery(terms,current,target);
 const missedConsecutively=streak(reviewWeekIndex);
 const previousMisses=reviewWeekIndex===terms.startWeekIndex?0:
  streak(reviewWeekIndex-1);
 const milestone:BroadcastMilestone=missedConsecutively===3?"WARNING":
  missedConsecutively===5?"FINAL_WARNING":
  status==="ON_TARGET"&&previousMisses>=3?"RECOVERED":null;
 return {dealId:terms.dealId,offerCode:terms.offerCode,reviewWeekIndex,
  target,rating:status==="LEGACY"||status==="NO_TV"?null:current?.rating??null,
  showId:current?.showId??null,status,missedConsecutively,previousMisses,
  milestone,bonusEligible:["ON_TARGET","WATCH","LEGACY"].includes(status)};
}
const voices:Record<string,{strong:string;low:string;slot:string;warning:string;return:string}>={
 BROADCAST_STABLE:{strong:"Consistency delivers. That's a schedule we can build around.",
  low:"Reliability is half the story. The audience has to follow.",
  slot:"Our viewers know when to tune in. Honour the agreed night.",
  warning:"Three disappointing weeks demand an immediate correction.",
  return:"That's the return to form we wanted to see."},
 BROADCAST_GROWTH:{strong:"That momentum is exactly why we wanted this show.",
  low:"Viewers can stream anything. Win back their attention.",
  slot:"A surprise schedule change is how viewers lose the thread.",
  warning:"The trend is going the wrong way. Find a new spark.",
  return:"Now that's the trajectory we signed up for."},
 BROADCAST_TV:{strong:"The audience delivered. Prime time was earned tonight.",
  low:"Prime time is a privilege. Our ratings desk wants answers.",
  slot:"Our prime-time slot is not optional. Put the show where it belongs.",
  warning:"Three misses. The board expects a credible turnaround.",
  return:"That is the prime-time result we demand."},
 BROADCAST_INDIE:{strong:"That's the crowd we know. Keep it loud.",
  low:"We love wrestling, but the numbers still matter.",
  slot:"The fans deserve to know when you're on the air.",
  warning:"This is your warning bell. Give the crowd a reason to return.",
  return:"Now that's more like it. Good wrestling finds its people."},
 BROADCAST_ARCHIVE:{strong:"A strong episode people will come back to.",
  low:"A library needs episodes people actually want to watch.",
  slot:"The agreed premiere night matters to our subscribers.",
  warning:"We need stronger premieres, not just a fuller catalogue.",
  return:"A proper addition to the archive. Keep that standard."},
 BROADCAST_GLOBAL:{strong:"A global audience expects landmark television. You delivered.",
  low:"The numbers are beneath the reach of this platform.",
  slot:"We do not move the world's appointment without an agreement.",
  warning:"Our global slot has missed expectations three weeks running.",
  return:"That is the global-level performance we signed for."}
};
export function broadcasterReaction(r:BroadcastNetworkReview):string{
 const p=voices[r.offerCode];
 if(!p)return COMMERCIAL_COMPANIES[r.offerCode]?.voice??
  "We will review the confirmed audience and schedule.";
 return r.milestone==="RECOVERED"?p.return:
  r.milestone==="WARNING"||r.milestone==="FINAL_WARNING"?p.warning:
  r.status==="OFF_SLOT"?p.slot:
  r.status==="BELOW_TARGET"||r.status==="NO_TV"?p.low:
  r.status==="LEGACY"?"We will judge the next fully reported broadcast.":p.strong;
}
