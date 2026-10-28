import assert from "node:assert/strict";
import test from "node:test";
import {balancedMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
import {chooseAiWorldCard,type AiRosterCandidate} from "../src/domain/ai-world-card.js";
import {aiPromotionStrategy} from "../src/domain/ai-promotion-strategy.js";
import {originalCompetitionFactor,originalExpectedDemand,
 originalShowSettlement,originalTicketYield,
 type LocalAudience,type Competitor,type TicketStrategy}
 from "../src/domain/legacy-show-economics.js";

/** Five-year scenario matrix using actual show pricing, demand, competition,
 * costs and live market-drift functions. Weekly wages/overheads represent
 * explicit policies, not a replay of contracts or production World results.
 * Those are separately covered by PostgreSQL multi-season/contract tests.
 * No test touches the saved World or connects to Neon.
 */
test("five-year economics: disciplined, reckless, recovery and cautious rivals",()=>{
 type Policy={id:string;cash:number;wages:number;overhead:number;
  media:number;sponsor:number;stars:number;appearance:number;venue:number;
  ticket:TicketStrategy;cadence:number;quality:number;crowd:number;
  day:number;adaptive:boolean};
 const policies:Policy[]=[
  {id:"good-booker",cash:175000,wages:18000,overhead:12000,media:9000,
   sponsor:4000,stars:60,appearance:12000,venue:3500,ticket:"STANDARD",
   cadence:1,quality:3.9,crowd:79,day:2,adaptive:true},
  {id:"reckless-spender",cash:450000,wages:140000,overhead:35000,media:15000,
   sponsor:8000,stars:81,appearance:64000,venue:13000,ticket:"PRESTIGE",
   cadence:1,quality:2.7,crowd:53,day:2,adaptive:false},
  {id:"recovery",cash:150000,wages:19000,overhead:14000,media:9000,
   sponsor:4000,stars:57,appearance:12000,venue:3500,ticket:"STANDARD",
   cadence:1,quality:3.65,crowd:74,day:4,adaptive:true},
  {id:"cautious-ai",cash:95000,wages:6500,overhead:5500,media:2500,
   sponsor:1500,stars:43,appearance:4500,venue:2800,ticket:"ACCESSIBLE",
   cadence:3,quality:3.3,crowd:67,day:6,adaptive:true}
 ];
 const market={audiencePotential:66,wrestlingInterest:74,spendingIndex:88};
 const aiRoster:AiRosterCandidate[]=Array.from({length:22},(_,i)=>({
  personId:"ai-talent-"+i,contractId:"ai-contract-"+i,
  bookingDivision:i%4===0?"WOMEN":"MEN",weeklyCapacity:4,
  recognition:Math.max(20,52-i),popularity:Math.max(20,52-i),
  momentum:Math.max(25,58-i),presentation:Math.max(20,50-i),
  matchCraft:Math.max(25,60-i)
 }));
 const aiFeatured=new Set<string>(),aiRecent:string[]=[];
 const local=new Map(policies.map(p=>[p.id,{
  liveStrength:40,awareness:41,loyalty:50
 } satisfies LocalAudience]));
 const cash=new Map(policies.map(p=>[p.id,p.cash]));
 const minCash=new Map(policies.map(p=>[p.id,p.cash]));
 const yearEnd=new Map(policies.map(p=>[p.id,[] as number[]]));
 const seasonAttendance=new Map(policies.map(p=>[p.id,[] as number[]]));
 const showCounts=new Map(policies.map(p=>[p.id,0]));
 const productionWeekly=new Map(policies.map(p=>[p.id,0]));
 for(let index=0;index<260;index++){
  const year=Math.floor(index/52)+1,week=index%52+1;
  const active=policies.filter(p=>index%p.cadence===0);
  const competitors:Competitor[]=active.map(p=>({
   showId:p.id+"-"+index,promotionId:p.id,marketId:"shared-metro",
   day:p.day,local:local.get(p.id)!,mediaReach:p.id==="reckless-spender"?75:45
  }));
  for(const p of policies){
   cash.set(p.id,cash.get(p.id)!+p.media+p.sponsor-p.overhead-p.wages);
   if(!active.includes(p))continue;
   const badYear=p.id==="recovery"&&year===2;
   const quality=badYear?2.15:p.quality;
   const crowd=badYear?43:p.crowd;
   const aiCard=p.id==="cautious-ai"?chooseAiWorldCard({
    worldId:"disposable-economy-scenario",worldSeed:"phase13-budget",
    year,week,promotionId:p.id,showId:p.id+"-"+index,
    roster:aiRoster,bookedShows:[],activeVenues:["civic-hall"],
    eventType:week%13===0?"MAJOR":"REGULAR",
    riskTolerance:35,matchQualityPreference:82,starPreference:42,
    strategy:aiPromotionStrategy({worldSeed:"phase13-budget",year,week,
     promotionId:p.id,riskTolerance:35,matchQualityPreference:82,starPreference:42}),
    recentPairs:aiRecent.slice(-18)
   }):null;
   if(aiCard)assert.equal(aiCard.status,"READY");
   if(aiCard?.status==="READY"){
    for(const m of aiCard.matches){
     for(const person of m.participants)aiFeatured.add(person.personId);
     if(m.participants.length===2)aiRecent.push(
      m.participants.map(x=>x.personId).sort().join(":"));
    }
    if(aiRecent.length>32)aiRecent.splice(0,aiRecent.length-32);
   }
   const aiPeople=aiCard?.status==="READY"?
    aiCard.matches.flatMap(m=>m.participants).map(({personId})=>aiRoster.find(x=>
     x.personId===personId)!).map(person=>({
      recognition:person.recognition,popularity:person.popularity,
      presentation:person.presentation
     })):null;
   const people=aiPeople??Array.from({length:6},()=>({
    recognition:p.stars,popularity:p.stars,presentation:p.stars
   }));
   const mediaReach=p.id==="reckless-spender"?75:45;
   const expected=originalExpectedDemand({
    promotionId:p.id,marketId:"shared-metro",day:p.day,
    eventType:week%13===0?"MAJOR":"REGULAR",ticketStrategy:p.ticket,
    mediaReach,market,local:local.get(p.id)!,people
   });
   const capacity=p.adaptive?expected<1500?1600:
    expected<2600?2600:expected<4200?4200:6000:
    p.id==="reckless-spender"?9000:5000;
   const hire=capacity===1600?2500:capacity===2600?3700:
    capacity===4200?6500:capacity===6000?10000:capacity===9000?24000:p.venue;
   const competing=originalCompetitionFactor(competitors.find(c=>c.promotionId===p.id)!,competitors);
   const settlement=originalShowSettlement({
    seed:"phase13-five-year-fixture",showId:p.id+"-"+index,
    expectedDemand:expected,competitionFactor:competing,
    capacity,ticketYield:originalTicketYield(p.ticket,market.spendingIndex),
    venueCost:hire,tier:"LOCAL",eventType:week%13===0?"MAJOR":"REGULAR",
    participants:6,away:false,appearanceFees:p.appearance
   });
   cash.set(p.id,cash.get(p.id)!+settlement.netResult);
   productionWeekly.set(p.id,productionWeekly.get(p.id)!+settlement.netResult);
   showCounts.set(p.id,showCounts.get(p.id)!+1);
   seasonAttendance.get(p.id)!.push(settlement.attendance/capacity);
   local.set(p.id,balancedMarketAfterEvent(local.get(p.id)!,{
    eventType:week%13===0?"MAJOR":"REGULAR",isHomeMarket:true,
    expectedDemand:expected,attendance:settlement.attendance,
    capacity,averageMatchRating:quality,crowdResponse:crowd
   }));
  }
  for(const p of policies){
   minCash.set(p.id,Math.min(minCash.get(p.id)!,cash.get(p.id)!));
   if(week===52)yearEnd.get(p.id)!.push(Math.round(cash.get(p.id)!));
  }
 }
 const report=policies.map(p=>({
  id:p.id,openingCash:p.cash,closingCash:Math.round(cash.get(p.id)!),
  minimumCash:Math.round(minCash.get(p.id)!),
  years:yearEnd.get(p.id)!,shows:showCounts.get(p.id)??0,
  totalEventNet:Math.round(productionWeekly.get(p.id)!),
  localStrength:local.get(p.id)!.liveStrength,
  meanSellThrough:Number((seasonAttendance.get(p.id)!.reduce((a,b)=>a+b,0)/
   seasonAttendance.get(p.id)!.length).toFixed(2))
 }));
 console.log("Phase 13 five-year actual economics formula matrix:",
  JSON.stringify({report,aiRosterWorkers:aiFeatured.size}));
 assert.equal(report.length,4);
 assert.ok(aiFeatured.size>=10,
  "The cautious rival's finances must reflect actual varied AI card participants");
 assert.ok(report.every(p=>p.shows>=86));
 assert.ok(report.every(p=>Number.isSafeInteger(p.closingCash)));
 assert.ok(report.find(p=>p.id==="good-booker")!.closingCash>
  report.find(p=>p.id==="reckless-spender")!.closingCash,
  "wasteful wages and poor venue choices must have a material downside");
 assert.ok(report.find(p=>p.id==="good-booker")!.closingCash>175000);
 assert.ok(report.find(p=>p.id==="cautious-ai")!.closingCash>0);
 assert.deepEqual(report.map(x=>x.years.length),[5,5,5,5]);
});

