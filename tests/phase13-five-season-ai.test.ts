import assert from "node:assert/strict";
import test from "node:test";
import {chooseAiWorldCard,chooseAiTitleChallenger,type AiRosterCandidate}
 from "../src/domain/ai-world-card.js";
import {aiPromotionStrategy} from "../src/domain/ai-promotion-strategy.js";

/** Five season stress of the actual seeded AI planner, not certified World
 * outcomes. Frozen champions, stable 28-person contracts, mixed divisions
 * and persistent tag teams intentionally make rotation harder to achieve.
 * Real recruitment/settlement and ownership remain in PostgreSQL journeys.
 */
test("five seasons: AI keeps credible champions, tag teams and genuinely uses its roster",()=>{
 const profiles=[
  {id:"workrate",riskTolerance:35,matchQualityPreference:95,starPreference:55},
  {id:"spectacle",riskTolerance:95,matchQualityPreference:75,starPreference:50},
  {id:"star-power",riskTolerance:45,matchQualityPreference:58,starPreference:97}
 ] as const;
 const diagnostics=[];
 for(const profile of profiles){
  const roster:AiRosterCandidate[]=Array.from({length:28},(_,i)=>({
   personId:profile.id+"-"+String(i).padStart(2,"0"),contractId:profile.id+"-deal-"+i,
   bookingDivision:i%4===0?"WOMEN":"MEN",weeklyCapacity:4,
   popularity:Math.max(25,92-i*2),recognition:Math.max(27,90-i*2),
   momentum:Math.max(32,87-i),presentation:Math.max(37,88-i),
   matchCraft:Math.max(39,90-i)
  }));
  const appearances=new Map<string,number>(),titleOpponents=new Set<string>(),
   mainEvents=new Set<string>(),recent:string[¶»§q«^