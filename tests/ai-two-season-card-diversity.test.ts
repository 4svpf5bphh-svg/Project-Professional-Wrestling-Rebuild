import test from "node:test";
import assert from "node:assert/strict";
import {chooseAiWorldCard,type AiRosterCandidate}
 from "../src/domain/ai-world-card.js";
import {aiPromotionStrategy}
 from "../src/domain/ai-promotion-strategy.js";

/** Long-run AI booking observation, entirely pure and disposable.
 * One card per 2-year simulated week per rival; never certifies a World or
 * changes the booking deadline. The original production planner is the
 * system under test, not a stub/synthetic replacement.
 */
test("two seasons of competing AI promotions maintain legal, distinct and varied bookings",()=>{
 const profiles=[
  {promotionId:"ring-workrate",riskTolerance:36,matchQualityPreference:96,starPreference:56},
  {promotionId:"lucha-spectacle",riskTolerance:96,matchQualityPreference:72,starPreference:54},
  {promotionId:"prime-stars",riskTolerance:45,matchQualityPreference:58,starPreference:98}
 ] as const;
 const out:{
  promotion:string;matches:number;majorEvents:number;men:number;women:number;
  intents:Set<string>;headliners:Set<string>;seen:Set<string>;
  repeatedHeadlineWeeks:number;duplicateWeeks:number
 }[]=[];
 for(const profile of profiles){
  const roster:Array<AiRosterCandidate>=Array.from({length:28},(_,i)=>({
   personId:profile.promotionId+"-p-"+String(i).padStart(2,"0"),
   contractId:profile.promotionId+"-c-"+i,
   bookingDivision:i%4===0?"WOMEN":"MEN",weeklyCapacity:4,
   popularity:Math.max(25,92-i*2),recognition:Math.max(27,90-i*2),
   momentum:Math.max(32,87-i),presentation:Math.max(37,88-i),
   matchCraft:Math.max(39,90-i)
  }));
  const result={promotion:profile.promotionId,matches:0,majorEvents:0,men:0,women:0,
   intents:new Set<string>(),headliners:new Set<string>(),seen:new Set<string>(),
   repeatedHeadlineWeeks:0,duplicateWeeks:0};
  const recent:string[]=[];
  let lastHeadline="";
  for(let i=0;i<104;i++){
   const year=Math.floor(i/52)+1,week=i%52+1,major=week%13===0;
   const eventType=major?"MAJOR" as const:"REGULAR" as const;
   const card=chooseAiWorldCard({
    worldId:"simulated-two-season-world",worldSeed:"8291",
    promotionId:profile.promotionId,showId:profile.promotionId+"-"+year+"-"+week,
    year,week,roster,bookedShows:[],activeVenues:["local-hall","city-arena"],
    eventType,riskTolerance:profile.riskTolerance,
    matchQualityPreference:profile.matchQualityPreference,starPreference:profile.starPreference,
    strategy:aiPromotionStrategy({worldSeed:"8291",year,week,...profile}),
    recentPairs:recent.slice(-18)
   });
   assert.equal(card.status,"READY",profile.promotionId+" week "+(i+1));
   if(card.status!=="READY")continue;
   assert.ok(card.matches.length>=2&&card.matches.length<=5);
   const rosterIds=roster.map(x=>x.personId);
   const people=card.matches.flatMap(m=>m.participants.map(p=>p.personId));
   assert.equal(people.length,new Set(people).size,"No same-week double booking");
   assert.ok(people.every(id=>rosterIds.includes(id)),"No rival or free-agent booking");
   assert.equal(card.matches.filter(x=>x.mainEvent).length,1);
   const headline=card.matches.at(-1)!;
   assert.equal(headline.mainEvent,true);
   const headKey=headline.participants.map(p=>p.personId).sort().join(":");
   if(lastHeadline===headKey)result.repeatedHeadlineWeeks++;
   lastHeadline=headKey;result.headliners.add(headKey);
   if(major){
    result.majorEvents++;
    assert.equal(headline.intent,"EPIC","Premium events retain their EPIC headliner");
   }
   for(const m of card.matches){
    assert.ok(m.participants.every(p=>roster.some(r=>r.personId===p.personId&&
     r.bookingDivision===m.bookingDivision)));
    assert.ok(m.participants.some(p=>p.personId===m.scriptedWinner));
    result.intents.add(m.intent);
    result.seen.add(headline.participants[0]!.personId);
    result.matches++;if(m.bookingDivision==="MEN")result.men++;else result.women++;
    if(m.participants.length===2)recent.push(
     m.participants.map(p=>p.personId).sort().join(":"));
   }
  }
  assert.equal(result.majorEvents,8);
  assert.ok(result.matches>=208&&result.matches<=520);
  assert.ok(result.intents.size>=3,
   "A promotion should present more than one match style over two seasons");
  assert.ok(result.headliners.size>=5,
   "A promotion should not be locked to one repeated two-season main event");
  out.push(result);
 }
 assert.equal(out.length,3);
 const report=out.map(x=>({promotion:x.promotion,
  totalMatches:x.matches,mainEventPairs:x.headliners.size,
  repeatedConsecutiveHeadliners:x.repeatedHeadlineWeeks,
  majorEvents:x.majorEvents,womensMatches:x.women,styles:x.intents.size}));
 console.log("Two-season authentic AI card diversity diagnostics:",JSON.stringify(report));
});
