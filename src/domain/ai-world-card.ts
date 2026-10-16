/** Archived PPW booking.ts / matches.ts adapted for the current singles-
 * capable resolver. Schedules full 2-5 match shows without exceeding the
 * existing 10-performer resource limit or fabricating tag/title logic.
 */
import {createHash} from "node:crypto";
import {DeterministicRng,deterministicSeedFromText} from "../simulation/legacy/rng.js";
import {chooseStaffFallbackSchedule,type ExistingShowBooking} from "./staff-show-schedule.js";
import type {StaffWrestlerCandidate} from "./staff-fallback-card.js";
import type {EventType} from "./legacy-show-economics.js";
export interface AiRosterCandidate extends StaffWrestlerCandidate{
 momentum:number;popularity:number;recognition:number;presentation:number;matchCraft:number;
}
export interface AiCardInput{
 worldId:string;worldSeed:string;year:number;week:number;promotionId:string;showId:string;
 roster:readonly AiRosterCandidate[];bookedShows:readonly ExistingShowBooking[];
 activeVenues:readonly string[];eventType:EventType;
 riskTolerance:number;matchQualityPreference:number;starPreference:number;
 recentPairs?:readonly string[];
}
export type AiCardMatch={
 participants:[{personId:string;contractId:string},{personId:string;contractId:string}];
 scriptedWinner:string;bookingDivision:"MEN"|"WOMEN";
 intent:"COMPETITIVE"|"STORY"|"PROTECTIVE"|"SHOWCASE"|"TECHNICAL"|"HIGH_RISK"|"EPIC";
 plannedFinish:"CLEAN_PIN"|"SUBMISSION"|"FLASH_PIN"|"PROTECTED_FINISH";
 plannedLengthMinutes:number;mainEvent:boolean;
};
export type AiCardResult=
 |{status:"READY";schedule:{day:number;venueId:string};matches:AiCardMatch[]}
 |{status:"UNFILLED";reason:"NO_ELIGIBLE_PAIR"|"NO_VENUE_OR_DAY"};
const push=(p:AiRosterCandidate)=>p.momentum*.4+p.popularity*.3+
 p.recognition*.2+p.presentation*.1;
const rank=(p:AiRosterCandidate)=>p.recognition+p.popularity+p.momentum+p.matchCraft;
const key=(a:string,b:string)=>a<b?a+":"+b:b+":"+a;
const hash=(parts:unknown[])=>createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const isStat=(x:number)=>typeof x==="number"&&Number.isFinite(x)&&x>=0&&x<=100;
const best=(a:AiRosterCandidate,b:AiRosterCandidate)=>
 rank(b)-rank(a)||a.personId.localeCompare(b.personId,"en");
function plannedLength(intent:AiCardMatch["intent"],main:boolean){
 const base={EPIC:28,TECHNICAL:20,HIGH_RISK:17,SHOWCASE:11,
  PROTECTIVE:12,STORY:14,COMPETITIVE:15}[intent];
 return base+(main&&intent!=="EPIC"?4:0);
}
function finish(intent:AiCardMatch["intent"],roll:number):AiCardMatch["plannedFinish"]{
 switch(intent){
  case"TECHNICAL":return roll<.45?"SUBMISSION":"CLEAN_PIN";
  case"PROTECTIVE":return roll<.55?"PROTECTED_FINISH":roll<.8?"FLASH_PIN":"CLEAN_PIN";
  case"STORY":return roll<.45?"PROTECTED_FINISH":roll<.72?"FLASH_PIN":"CLEAN_PIN";
  case"SHOWCASE":return roll<.7?"CLEAN_PIN":roll<.88?"SUBMISSION":"FLASH_PIN";
  case"EPIC":return roll<.58?"CLEAN_PIN":roll<.9?"SUBMISSION":"FLASH_PIN";
  case"HIGH_RISK":return roll<.55?"CLEAN_PIN":roll<.78?"FLASH_PIN":"PROTECTED_FINISH";
  case"COMPETITIVE":return roll<.56?"CLEAN_PIN":roll<.8?"SUBMISSION":"FLASH_PIN";
 }
}
function style(input:AiCardInput,order:number,isMain:boolean):AiCardMatch["intent"]{
 if(isMain&&input.eventType==="MAJOR")return "EPIC";
 const rng=new DeterministicRng(deterministicSeedFromText(
  `${input.worldSeed}:${input.showId}:intent:${order}`));
 if(input.riskTolerance>=72&&rng.chance(.18))return "HIGH_RISK";
 if(input.matchQualityPreference>=70&&rng.chance(.35))return "TECHNICAL";
 if(input.starPreference>=70&&rng.chance(.3))return "SHOWCASE";
 return rng.pick(["COMPETITIVE","STORY","PROTECTIVE"] as const);
}
export function chooseAiWorldCard(input:AiCardInput):AiCardResult{
 if(!input.worldId||!input.showId||!input.promotionId||!input.worldSeed||
  !Number.isSafeInteger(input.year)||input.year<1||
  !Number.isInteger(input.week)||input.week<1||input.week>52||
  !["REGULAR","MAJOR"].includes(input.eventType)||
  ![input.riskTolerance,input.matchQualityPreference,input.starPreference].every(isStat)||
  input.roster.length>256||input.activeVenues.length>256||
  input.bookedShows.length>128||(input.recentPairs?.length??0)>1024)
   throw new Error("Invalid World AI card context");
 const used=new Map<string,number>();
 for(const x of input.bookedShows)for(const id of new Set(x.personIds))
  used.set(id,(used.get(id)??0)+1);
 const unique=new Map<string,AiRosterCandidate>();
 for(const p of input.roster){
  if(!p.personId||!p.contractId||!["MEN","WOMEN"].includes(p.bookingDivision)||
    !Number.isInteger(p.weeklyCapacity)||p.weeklyCapacity<1||p.weeklyCapacity>7||
    ![p.momentum,p.popularity,p.recognition,p.presentation,p.matchCraft].every(isStat))
   throw new Error("Invalid original AI wrestler profile");
  if((used.get(p.personId)??0)>=p.weeklyCapacity)continue;
  const prior=unique.get(p.personId);
  if(!prior||p.contractId<prior.contractId)unique.set(p.personId,p);
 }
 const eligible=[...unique.values()].sort(best);
 if(!["MEN","WOMEN"].some(division=>eligible.filter(p=>p.bookingDivision===division).length>=2))
  return {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"};
 const occupiedSameDay=(day:number,id:string)=>input.bookedShows.some(show=>
  show.day===day&&show.personIds.includes(id));
 // Reuse the World-seeded schedule policy, but choose the actual top-card
 // wrestlers within its fixed day. A few unavailable stars cannot veto
 // an otherwise valid venue/day for the rest of the roster.
 const schedule=chooseStaffFallbackSchedule({
  worldId:input.worldId,worldSeed:input.worldSeed,year:input.year,week:input.week,
  promotionId:input.promotionId,showId:input.showId,
  preferredDay:null,preferredVenueId:null,personIds:[],
  availableVenueIds:input.activeVenues,bookedShows:input.bookedShows});
 if(!schedule)return {status:"UNFILLED",reason:"NO_VENUE_OR_DAY"};
 const available=eligible.filter(p=>!occupiedSameDay(schedule.day,p.personId));
 const men=available.filter(p=>p.bookingDivision==="MEN"),women=available.filter(p=>p.bookingDivision==="WOMEN");
 if(men.length<2&&women.length<2)return {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"};
 // Original booking ranks the appearances; give both divisions a reasonable
 // showcase when roster allows, even if men's absolute ranking dominates.
 const chosen:AiRosterCandidate[]=[];
 if(men.length>=2&&women.length>=2&&available.length>=4){
  chosen.push(...men.slice(0,2),...women.slice(0,2));
 }
 for(const p of available){
  if(chosen.length>=10)break;
  if(!chosen.some(x=>x.personId===p.personId))chosen.push(p);
 }
 // If ten slots leave one wrestler unpaired, use eight rather than using
 // the same performer twice or mixing the divisions.
 const pool=[...chosen].sort(best);
 const recent=new Set(input.recentPairs??[]);
 const cards:Array<[AiRosterCandidate,AiRosterCandidate]>=[];
 while(pool.length>=2&&cards.length<5){
  const head=pool.shift()!;
  const candidates=pool.filter(p=>p.bookingDivision===head.bookingDivision);
  if(!candidates.length)continue;
  candidates.sort((a,b)=>{
   const ar=recent.has(key(head.personId,a.personId))?1:0;
   const br=recent.has(key(head.personId,b.personId))?1:0;
   return ar-br||Math.abs(push(head)-push(a))-Math.abs(push(head)-push(b))||
    rank(b)-rank(a)||a.personId.localeCompare(b.personId,"en");
  });
  const opponent=candidates[0]!;
  pool.splice(pool.findIndex(p=>p.personId===opponent.personId),1);
  cards.push([head,opponent]);
 }
 if(!cards.length)return {status:"UNFILLED",reason:"NO_ELIGIBLE_PAIR"};
 // Strongest star power closes, by the exact archived booking push score.
 cards.sort((a,b)=>(push(a[0])+push(a[1]))/2-
  (push(b[0])+push(b[1]))/2||
  key(a[0].personId,a[1].personId).localeCompare(
   key(b[0].personId,b[1].personId),"en"));
 const matches:AiCardMatch[]=cards.map(([a,b],i)=>{
  const order=i+1,main=i===cards.length-1;
  const intent=style(input,order,main);
  const finalRng=new DeterministicRng(deterministicSeedFromText(
   `${input.worldSeed}:${input.showId}:finish:${order}`));
  const winnerRng=new DeterministicRng(deterministicSeedFromText(
   `${input.worldSeed}:${input.showId}:winner:${order}`));
  const fav=push(a)+winnerRng.float(-7,7)>=push(b)+winnerRng.float(-7,7)?a:b;
  return {
   participants:[{personId:a.personId,contractId:a.contractId},
    {personId:b.personId,contractId:b.contractId}],
   scriptedWinner:fav.personId,bookingDivision:a.bookingDivision,
   intent,plannedFinish:finish(intent,finalRng.next()),
   plannedLengthMinutes:plannedLength(intent,main),mainEvent:main,
  };
 });
 return {status:"READY",schedule,matches};
}
