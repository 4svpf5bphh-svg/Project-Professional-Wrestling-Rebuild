/** Original PPW events.ts and market-competition.ts show economics.
 * Pure functions, no network/database access or invented World defaults.
 */
import {DeterministicRng,deterministicSeedFromText} from "../simulation/legacy/rng.js";
export type ShowTier="GLOBAL"|"NATIONAL"|"RISING"|"INDEPENDENT"|"LOCAL";
export type EventType="REGULAR"|"MAJOR";
export type TicketStrategy="ACCESSIBLE"|"STANDARD"|"PREMIUM"|"PRESTIGE";
export interface ShowMarket {
 audiencePotential:number;wrestlingInterest:number;spendingIndex:number;
}
export interface LocalAudience {
 awareness:number;liveStrength:number;loyalty:number;
}
export interface StarPull {
 recognition:number;popularity:number;presentation:number;
}
export interface Competitor {
 showId:string;promotionId:string;marketId:string;day:number;
 mediaReach:number;local:LocalAudience;
}
export interface TicketContext {
 promotionId:string;marketId:string;day:number;eventType:EventType;
 ticketStrategy:TicketStrategy;mediaReach:number;market:ShowMarket;
 local:LocalAudience;people:readonly StarPull[];
}
const clamp=(v:number,low:number,high:number)=>Math.max(low,Math.min(high,v));
const finite=(v:number)=>typeof v==="number"&&Number.isFinite(v);
const stats=(xs:readonly number[],label:string)=>{
 if(!xs.every(v=>finite(v)&&v>=0&&v<=100))throw new Error("Invalid original "+label);
};
const strengths=(local:LocalAudience)=>[local.awareness,local.liveStrength,local.loyalty];

export function originalTicketYield(strategy:TicketStrategy,spendingIndex:number):number {
 if(!["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"].includes(strategy)
 ||!finite(spendingIndex)||spendingIndex<0||spendingIndex>1000)
  throw new Error("Invalid original ticket context");
 const price={ACCESSIBLE:32,STANDARD:48,PREMIUM:72,PRESTIGE:110}[strategy];
 return Math.round(price*(.72+spendingIndex/250)*100)/100;
}
export function originalExpectedDemand(c:TicketContext):number {
 if(!["REGULAR","MAJOR"].includes(c.eventType)||!c.market||!c.local
 ||!["ACCESSIBLE","STANDARD","PREMIUM","PRESTIGE"].includes(c.ticketStrategy))
  throw new Error("Invalid original show demand context");
 stats([c.market.audiencePotential,c.market.wrestlingInterest,
  c.mediaReach,...strengths(c.local)],"show demand");
 if(!finite(c.market.spendingIndex)||c.market.spendingIndex<0
 ||c.market.spendingIndex>1000||c.people.length>100)
  throw new Error("Invalid original show market or roster");
 for(const p of c.people)stats([p.recognition,p.popularity,p.presentation],"star");
 const localFactor=(.25+c.local.liveStrength/155)*(.68+c.local.awareness/310);
 const top=[...c.people].sort((a,b)=>
  (b.recognition+b.popularity+b.presentation)-
  (a.recognition+a.popularity+a.presentation)).slice(0,6);
 const avg=top.length?top.reduce((s,p)=>
  s+(p.recognition+p.popularity+p.presentation)/3,0)/top.length:20;
 const ticketFactor={ACCESSIBLE:1.14,STANDARD:1,PREMIUM:.86,PRESTIGE:.68}[c.ticketStrategy];
 return Math.max(100,Math.round(
  c.market.audiencePotential*115*localFactor*
  (.68+c.market.wrestlingInterest/190)*
  (.78+c.mediaReach/245)*(c.eventType==="MAJOR"?1.32:.86)*
  (.74+avg/210)*ticketFactor));
}
function audiencePower(local:LocalAudience,mediaReach:number){
 stats([...strengths(local),mediaReach],"competition context");
 const weighted=local.liveStrength*.5+local.awareness*.3+local.loyalty*.2;
 return clamp(weighted*.8+mediaReach*.2,0,100);
}
function proximity(gap:number){
 return gap===0?1:gap<=2?.85:gap<=4?.7:.55;
}
export function originalCompetitionFactor(
 target:Competitor,weekShows:readonly Competitor[],
):number {
 const own=audiencePower(target.local,target.mediaReach);
 if(!Number.isInteger(target.day)||target.day<1||target.day>7)
  throw new Error("Invalid original show day");
 let pressure=0;
 for(const rival of weekShows){
  if(rival.showId===target.showId||rival.promotionId===target.promotionId
   ||rival.marketId!==target.marketId)continue;
  if(!Number.isInteger(rival.day)||rival.day<1||rival.day>7)
   throw new Error("Invalid rival show day");
  const power=audiencePower(rival.local,rival.mediaReach);
  const relative=power/Math.max(1,own+power);
  const base=.035+.22*(power/100)*(.65+.7*relative);
  pressure+=base*proximity(Math.abs(rival.day-target.day));
 }
 return clamp(1/(1+pressure),.58,1);
}
export function originalProductionCost(tier:ShowTier,type:EventType):number {
 if(!["REGULAR","MAJOR"].includes(type)||!["GLOBAL","NATIONAL","RISING","INDEPENDENT","LOCAL"].includes(tier))
  throw new Error("Invalid original production terms");
 const normal={GLOBAL:260000,NATIONAL:125000,RISING:60000,INDEPENDENT:25000,LOCAL:12000}[tier];
 return type==="MAJOR"?Math.round(normal*1.75):normal;
}
export function originalTravelCost(tier:ShowTier,participants:number,away:boolean):number {
 if(!["GLOBAL","NATIONAL","RISING","INDEPENDENT","LOCAL"].includes(tier)
 ||!Number.isInteger(participants)||participants<0||participants>100)
  throw new Error("Invalid original travel terms");
 if(!away)return 0;
 const base={GLOBAL:45000,NATIONAL:30000,RISING:18000,INDEPENDENT:10000,LOCAL:6000}[tier];
 return base+participants*(tier==="GLOBAL"?2000:tier==="NATIONAL"?1500:1000);
}
export interface SettlementContext{
 seed:string|number;showId:string;expectedDemand:number;competitionFactor:number;
 capacity:number;ticketYield:number;venueCost:number;tier:ShowTier;
 eventType:EventType;participants:number;away:boolean;appearanceFees:number;
}
export function originalShowSettlement(input:SettlementContext){
 const vals=[input.expectedDemand,input.competitionFactor,input.capacity,
  input.ticketYield,input.venueCost,input.appearanceFees];
 if(!input.showId||input.showId.length>200||!vals.every(finite)
 ||!Number.isSafeInteger(input.expectedDemand)||input.expectedDemand<100
 ||!Number.isInteger(input.capacity)||input.capacity<1
 ||input.competitionFactor<.58||input.competitionFactor>1
 ||input.ticketYield<=0||input.venueCost<0||input.appearanceFees<0)
  throw new Error("Invalid original show settlement context");
 const rng=new DeterministicRng(deterministicSeedFromText(`${input.seed}:${input.showId}:attendance`));
 const demand=Math.max(0,Math.round(input.expectedDemand*input.competitionFactor*rng.float(.92,1.08)));
 const attendance=Math.min(input.capacity,demand);
 const gateRevenue=Math.round(attendance*input.ticketYield);
 const production=originalProductionCost(input.tier,input.eventType);
 const travel=originalTravelCost(input.tier,input.participants,input.away);
 const totalCost=input.venueCost+production+travel+input.appearanceFees;
 const netResult=gateRevenue-totalCost;
 if(![gateRevenue,totalCost,netResult].every(Number.isSafeInteger))
  throw new Error("Original event financial amounts overflow");
 return {expectedDemand:input.expectedDemand,attendance,gateRevenue,
  venueCost:input.venueCost,productionCost:production,travelCost:travel,
  appearanceFees:input.appearanceFees,totalCost,netResult,
  incrementalCash:gateRevenue-input.venueCost-production-travel};
}
