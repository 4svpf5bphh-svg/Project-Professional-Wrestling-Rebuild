import assert from "node:assert/strict";
import test from "node:test";
import {originalMarketAfterEvent,balancedMarketAfterEvent} from "../src/domain/legacy-market-drift.js";
import {originalCompetitionFactor,originalExpectedDemand,
 originalShowSettlement,originalTicketYield,
 type LocalAudience,type EventType,type Competitor,type StarPull}
 from "../src/domain/legacy-show-economics.js";

/** Observational multi-season balance test, NOT a new market algorithm.
 * Simulates 208 completed weeks with different show quality, audience
 * reaction, competing dates, ticket demand, capacity and attendance.
 * Uses the actual original-rebuild economics and market drift functions.
 * The two venue policies are explicit scenarios, not factual player data.
 */
const initial=[
 {awareness:35,liveStrength:42,loyalty:48},
 {awareness:38,liveStrength:49,loyalty:53}
] satisfies LocalAudience[];
const venueSizes=[1800,2600,3500,4700,6200,8200,10000] as const;
const venueCost=new Map<number,number>([
 [1800,2500],[2600,3500],[3500,4700],[4700,6700],
 [6200,9500],[8200,13500],[10000,17500]
]);
const market={audiencePotential:65,wrestlingInterest:70,spendingIndex:90};
const headliners:readonly StarPull[][]=[
 Array.from({length:6},()=>({recognition:58,popularity:52,presentation:64})),
 Array.from({length:6},()=>({recognition:52,popularity:50,presentation:57}))
];
const ratingA=[3.2,3.7,3.1,4.1,2.9,3.6,3.3,3.9,2.7,3.4,4.0,3.1,3.6];
const crowdA=[67,76,62,82,55,71,68,77,52,70,80,61,74];
const slumpA=[2.2,2.7,2.5,2.9,2.1,2.6,2.8,2.4,2.3,2.9,2.5,2.1,2.7];
const slumpCrowdA=[43,50,49,58,42,54,55,48,46,57,51,44,53];
const ratingB=[2.7,3.4,2.9,3.2,3.6,3.0,2.6,3.7,3.1,3.4,2.8,3.5,3.2];
const crowdB=[53,69,59,65,73,60,51,76,63,71,55,70,67];
type ScenarioMode="adaptive"|"fixed";
type MarketRule="legacy"|"balanced";
type Row={year:number;week:number;strength:number;awareness:number;
 loyalty:number;expectedDemand:number;attendance:number;capacity:number;
 profit:number;attendanceRatio:number};
type Summary={
 mode:ScenarioMode;rule:MarketRule;atYears:{year:number;A:LocalAudience;B:LocalAudience}[];
 firstA95:number|null;firstB95:number|null;
 firstA100:number|null;firstB100:number|null;
 totalShows:number;year2SlumpA:{growing:number;declining:number;flat:number};
 averageAttendanceRatio:number;totalShowProfit:number;
 lateSeasonCompetition:number;
};
function runScenario(mode:ScenarioMode,rule:MarketRule="legacy"):Summary{
 let states:LocalAudience[]=initial.map(x=>({...x}));
 const rows:Row[][]=[[],[]];
 let firstA95:null|number=null,firstB95:null|number=null;
 let firstA100:null|number=null,firstB100:null|number=null;
 const atYears:Summary["atYears"]=[];
 let lateCompetition=0;
 const changes={growing:0,declining:0,flat:0};
 for(let i=0;i<208;i++){
  const year=Math.floor(i/52)+1,week=i%52+1,major=week%13===0;
  const eventType:EventType=major?"MAJOR":"REGULAR";
  const before=states.map(x=>({...x}));
  const reaches=[38,32],days=[5,(week%3===0?5:6)];
  const shows:Competitor[]=before.map((local,k)=>({
   showId:"balance-"+(i+1)+"-"+k,promotionId:"rival-"+k,
   marketId:"common-territory",day:days[k]!,mediaReach:reaches[k]!,local
  }));
  const next:LocalAudience[]=[];
  for(let k=0;k<2;k++){
   const ticketStrategy="ACCESSIBLE" as const;
   const demand=originalExpectedDemand({
    promotionId:shows[k]!.promotionId,marketId:"common-territory",
    day:shows[k]!.day,eventType,ticketStrategy,mediaReach:reaches[k]!,
    market,local:before[k]!,people:headliners[k]!
   });
   const factor=originalCompetitionFactor(shows[k]!,shows);
   const capacity=mode==="fixed"?3500:
    venueSizes.find(v=>v>=demand*1.05)??venueSizes[venueSizes.length-1]!;
   const money=originalShowSettlement({
    seed:"balance-seed-614",showId:shows[k]!.showId,
    expectedDemand:demand,competitionFactor:factor,capacity,
    ticketYield:originalTicketYield(ticketStrategy,market.spendingIndex),
    venueCost:venueCost.get(capacity)!,tier:"LOCAL",eventType,
    participants:10,away:false,appearanceFees:6500
   });
   const mix=i%13;
   const duringSlump=k===0&&year===2;
   const rating=(duringSlump?slumpA:k===0?ratingA:ratingB)[mix]!+
    (major?.17:0);
   const crowd=(duringSlump?slumpCrowdA:k===0?crowdA:crowdB)[mix]!+
    (major?5:0);
   const after=(rule==="balanced"?balancedMarketAfterEvent:originalMarketAfterEvent)(before[k]!,{
    eventType,isHomeMarket:true,
    expectedDemand:money.expectedDemand,attendance:money.attendance,
    capacity,averageMatchRating:rating,crowdResponse:crowd
   });
   if(year===2&&k===0){
    if(after.liveStrength>before[k]!.liveStrength)changes.growing++;
    else if(after.liveStrength<before[k]!.liveStrength)changes.declining++;
    else changes.flat++;
   }
   assert.ok(money.attendance<=capacity&&money.attendance>=0);
   assert.ok(factor>=.58&&factor<=1);
   assert.ok(Number.isFinite(money.netResult));
   rows[k]!.push({year,week,strength:after.liveStrength,
    awareness:after.awareness,loyalty:after.loyalty,
    expectedDemand:demand,attendance:money.attendance,capacity,
    profit:money.netResult,
    attendanceRatio:money.attendance/demand});
   next.push(after);
  }
  states=next;
  if(firstA95===null&&states[0]!.liveStrength>=95)firstA95=i+1;
  if(firstB95===null&&states[1]!.liveStrength>=95)firstB95=i+1;
  if(firstA100===null&&states[0]!.liveStrength===100)firstA100=i+1;
  if(firstB100===null&&states[1]!.liveStrength===100)firstB100=i+1;
  if(week===52)atYears.push({year,A:{...states[0]!},B:{...states[1]!}});
  if(year===4)lateCompetition+=Math.abs(states[0]!.liveStrength-states[1]!.liveStrength);
 }
 const all=[...rows[0]!,...rows[1]!];
 return {mode,rule,atYears,firstA95,firstB95,firstA100,firstB100,
  totalShows:all.length,year2SlumpA:changes,
  averageAttendanceRatio:Math.round(
   all.reduce((sum,x)=>sum+x.attendanceRatio,0)/all.length*1000)/1000,
  totalShowProfit:all.reduce((sum,x)=>sum+x.profit,0),
  lateSeasonCompetition:Math.round(lateCompetition/52*10)/10};
}

test("208 weeks of varied cards, competition and settlements quantify natural audience saturation",()=>{
 const adaptive=runScenario("adaptive"),fixed=runScenario("fixed");
 for(const data of [adaptive,fixed]){
  assert.equal(data.totalShows,416);
  assert.equal(data.atYears.length,4);
  assert.ok(data.averageAttendanceRatio>0&&data.averageAttendanceRatio<=1.08);
  assert.equal(data.year2SlumpA.growing+data.year2SlumpA.declining+
   data.year2SlumpA.flat,52);
  for(const y of data.atYears)for(const p of [y.A,y.B])
   for(const value of [p.awareness,p.liveStrength,p.loyalty])
    assert.ok(value>=2&&value<=100);
  assert.deepEqual(data,runScenario(data.mode,data.rule),
   "Four-year marketplace outcomes are deterministic across restarts");
 }
 // Do not bake in an arbitrary desirable popularity ceiling: this test is
 // evidence for game-design decisions, not an instruction to rewrite ratings.
 console.log("PPW varied four-year audience/venue balance "+
  JSON.stringify({adaptive,fixed}));
});

test("four-season quality-sensitive markets retain downturn and rebound under both venue policies",()=>{
 for(const mode of ["adaptive","fixed"] as const){
  const legacy=runScenario(mode),balanced=runScenario(mode,"balanced");
  assert.equal(balanced.totalShows,416);
  assert.ok(balanced.year2SlumpA.declining>=26 &&
   balanced.year2SlumpA.declining>legacy.year2SlumpA.declining,
   "A sustained weaker season must lose more supporters than the original market");
  assert.ok(balanced.atYears[1]!.A.liveStrength<legacy.atYears[1]!.A.liveStrength,
   "By season two bad wrestling must leave a visible audience cost");
  assert.ok(balanced.atYears[3]!.A.liveStrength>balanced.atYears[1]!.A.liveStrength,
   "Two subsequent good seasons should restore some lost territory following");
  assert.ok(balanced.lateSeasonCompetition>legacy.lateSeasonCompetition,
   "Sustained fan reception must preserve meaningful competitive differentiation");
  assert.ok(balanced.atYears[3]!.A.liveStrength<99&&
   balanced.atYears[3]!.B.liveStrength<99,
   "Normal mixed booking should not automatically saturate the audience cap");
  assert.deepEqual(balanced,runScenario(mode,"balanced"));
  console.log("PPW quality-sensitive four-year market "+JSON.stringify({mode,
   legacy:legacy.atYears,balanced:balanced.atYears,
   legacySlump:legacy.year2SlumpA,balancedSlump:balanced.year2SlumpA,
   legacyLateGap:legacy.lateSeasonCompetition,
   balancedLateGap:balanced.lateSeasonCompetition}));
 }
});
