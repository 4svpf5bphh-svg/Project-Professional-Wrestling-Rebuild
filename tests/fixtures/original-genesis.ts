/** Small deterministic original-WorldState-shaped Genesis sample used only
 * in disposable PostgreSQL tests; no synthetic player data reaches production.
 */
import type {OriginalGenesisSource} from "../../src/domain/original-genesis-projection.js";
export function originalGenesisFixture(worldId:string,peopleCount=643):OriginalGenesisSource{
 const promotions=Array.from({length:8},(_,i)=>({
  id:"promotion-"+i,worldId,name:"Promotion "+i,homeMarketId:"market-"+(i%4),
  tier:(i===0?"GLOBAL":i<3?"NATIONAL":i<5?"RISING":"INDEPENDENT") as "GLOBAL"|"NATIONAL"|"RISING"|"INDEPENDENT",
  lifecycle:"ACTIVE",controllerType:"AI" as const,cash:5_000_000+i*1_000,
  debt:0,mediaReach:90-i*7,
  weeklyMediaIncome:300_000,weeklySponsorIncome:25_000,
  weeklyFixedOverhead:60_000,lastWeeklyNet:0,financialDistress:"HEALTHY",
 }));
 const markets=Array.from({length:4},(_,i)=>({
  id:"market-"+i,worldId,name:"Territory "+i,audiencePotential:65+i*5,
  wrestlingInterest:70+i*3,spendingIndex:90+i*5,
 }));
 const promotionMarketStates=Array.from({length:8},(_,i)=>
  markets.map((m,j)=>({worldId,promotionId:"promotion-"+i,marketId:m.id,
   awareness:55+i+j,liveStrength:50+i+j,loyalty:45+i+j}))).flat();
 const people=Array.from({length:peopleCount},(_,i)=>({
  id:"person-"+i,worldId,name:"Wrestler "+i,status:"ACTIVE" as const,
  careerStage:(i%4===0?"PROSPECT":i%4===1?"PRIME":i%4===2?"VETERAN":"SPECIAL_ATTRACTION") as
    "PROSPECT"|"PRIME"|"VETERAN"|"SPECIAL_ATTRACTION",
  morale:80,recognition:10+(i%80),popularity:12+(i%80),momentum:30+(i%55),
  fatigue:0,wear:i%70,skills:{inRingQuality:60+(i%30),matchCraft:65+(i%25),
   presentation:68+(i%25),stamina:75,safety:88},
  priorities:{money:65,role:70,prestige:50,schedule:45,loyalty:40,exposure:60},
  bookingDivision:(i%3===0?"WOMEN":"MEN") as "WOMEN"|"MEN",
  defaultAlignment:"FACE" as const,
  portableGimmickId:"gimmick-"+(i%20),
 }));
 const venues=Array.from({length:16},(_,i)=>({
  id:"venue-"+i,worldId,name:"Arena "+i,marketId:"market-"+(i%4),capacity:1500+i*100,
  weeklyHireCost:25_000+i*750,prestige:55,productionSuitability:80,
 }));
 const contracts=Array.from({length:Math.min(400,peopleCount)},(_,i)=>{
  const family=(i%5===0?"EXCLUSIVE":"LIMITED_NON_EXCLUSIVE") as
   "EXCLUSIVE"|"LIMITED_NON_EXCLUSIVE";
  const entitlement=family==="EXCLUSIVE"?26:7,used=family==="EXCLUSIVE"?0:i%4;
  return {id:"contract-"+i,worldId,personId:"person-"+i,
   promotionId:"promotion-"+(i%8),family,status:"SIGNED" as const,
   exclusivity:(family==="EXCLUSIVE"?"EXCLUSIVE":"NON_EXCLUSIVE") as "EXCLUSIVE"|"NON_EXCLUSIVE",
   startDate:{year:1,week:1,day:1},endDate:{year:1,week:26,day:7},
   datesUsed:used,dateEntitlement:entitlement,
   weeklyGuarantee:family==="EXCLUSIVE"?18_000:3_000,
   appearanceFee:family==="EXCLUSIVE"?0:8_000,signingBonus:0,
   roleExpectation:"FEATURED" as const,creativeControl:"CONSULTATION" as const};
 });
 return {world:{id:worldId,name:"PPW Genesis",seed:7,rulesetVersion:"sim0.0.11",
   currentDate:{year:1,week:1,day:1}},
  ruleset:{version:"sim0.0.11",weeksPerYear:52,offerAcceptanceThreshold:50,
   injuryRateMultiplier:1},markets,promotionMarketStates,promotions,people,venues,contracts};
}
