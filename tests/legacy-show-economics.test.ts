import assert from "node:assert/strict";
import test from "node:test";
import {originalTicketYield,originalExpectedDemand,originalCompetitionFactor,
 originalProductionCost,originalTravelCost,originalShowSettlement}
 from "../src/domain/legacy-show-economics.js";
const market={audiencePotential:80,wrestlingInterest:75,spendingIndex:100};
const local={awareness:72,liveStrength:68,loyalty:65};
const stars=[{recognition:88,popularity:83,presentation:91},
 {recognition:72,popularity:67,presentation:74}];
test("Original PPW ticket and production/travel rules across strategies and tiers",()=>{
 assert.equal(originalTicketYield("ACCESSIBLE",100),35.84);
 assert.equal(originalTicketYield("STANDARD",100),53.76);
 assert.equal(originalTicketYield("PREMIUM",100),80.64);
 assert.equal(originalTicketYield("PRESTIGE",100),123.2);
 assert.equal(originalProductionCost("GLOBAL","REGULAR"),260000);
 assert.equal(originalProductionCost("GLOBAL","MAJOR"),455000);
 assert.equal(originalProductionCost("LOCAL","REGULAR"),12000);
 assert.equal(originalProductionCost("INDEPENDENT","MAJOR"),43750);
 assert.equal(originalTravelCost("GLOBAL",8,true),61000);
 assert.equal(originalTravelCost("NATIONAL",8,true),42000);
 assert.equal(originalTravelCost("LOCAL",8,true),14000);
 assert.equal(originalTravelCost("GLOBAL",8,false),0);
});
test("Original market demand, competition, caps and seeded ticket settlement",()=>{
 const ctx={promotionId:"a",marketId:"m",day:2,eventType:"REGULAR" as const,
  ticketStrategy:"STANDARD" as const,mediaReach:75,market,local,people:stars};
 const regular=originalExpectedDemand(ctx);
 const major=originalExpectedDemand({...ctx,eventType:"MAJOR" as const});
 const accessible=originalExpectedDemand({...ctx,ticketStrategy:"ACCESSIBLE" as const});
 const prestige=originalExpectedDemand({...ctx,ticketStrategy:"PRESTIGE" as const});
 assert.ok(major>regular);
 assert.ok(accessible>regular);
 assert.ok(prestige<regular);
 const target={showId:"show-a",promotionId:"a",marketId:"m",day:2,local,mediaReach:75};
 const rival={showId:"show-b",promotionId:"b",marketId:"m",day:2,local,mediaReach:90};
 const far={...rival,day:7};
 const competition=originalCompetitionFactor(target,[target,rival]);
 assert.ok(competition<1);
 assert.ok(originalCompetitionFactor(target,[target,far])>competition);
 assert.equal(originalCompetitionFactor(target,[target,{...rival,marketId:"other"}]),1);
 const quote={seed:47,showId:"show-a",expectedDemand:regular,competitionFactor:competition,
  capacity:2500,ticketYield:originalTicketYield("STANDARD",market.spendingIndex),
  venueCost:20000,tier:"LOCAL" as const,eventType:"REGULAR" as const,
  participants:8,away:false,appearanceFees:8000};
 const settled=originalShowSettlement(quote);
 assert.deepEqual(originalShowSettlement(quote),settled);
 assert.equal(settled.attendance<=2500,true);
 assert.equal(settled.gateRevenue,Math.round(settled.attendance*quote.ticketYield));
 assert.equal(settled.totalCost,40000);
 assert.equal(settled.incrementalCash,settled.gateRevenue-32000);
 assert.equal(settled.netResult,settled.incrementalCash-8000);
 assert.throws(()=>originalShowSettlement({...quote,capacity:0}),/Invalid/);
 assert.throws(()=>originalShowSettlement({...quote,competitionFactor:0}),/Invalid/);
});
