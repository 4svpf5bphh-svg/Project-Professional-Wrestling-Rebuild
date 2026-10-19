import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAnnualStanding,type StandingEvidence} from "../src/domain/annual-promotion-standing.js";
const old={prestige:82,fanReputation:78,businessReputation:82,talentReputation:74};
const evidence:StandingEvidence={
 tier:"GLOBAL",lifecycle:"ACTIVE",distress:"HEALTHY",mediaReach:90,
 completed:2,cancelled:0,meanCrowd:80,meanDemand:90,topFiveLoyalty:60,
 majorCount:1,majorScore:78,championshipPrestige:72,
 rosterCount:10,rosterUsed:4,renewalAccepted:3,renewalRejected:1,
 restructures:0,terminations:0
};
test("original main: annual company scores use four independent blended signals",()=>{
 assert.deepEqual(evaluateAnnualStanding(old,evidence),{
  prestige:81.9,fanReputation:78.4,businessReputation:85.1,talentReputation:72.1
 });
 assert.deepEqual(old,{prestige:82,fanReputation:78,businessReputation:82,talentReputation:74},
  "The input standing is not mutated");
});
test("original main: fan fallback, reputational penalties, inactive promotion and asymmetric prestige",()=>{
 const collapsed=evaluateAnnualStanding(old,{...evidence,completed:0,
  cancelled:0,meanCrowd:null,meanDemand:null,topFiveLoyalty:null,
  majorCount:0,majorScore:null,championshipPrestige:null,
  lifecycle:"DORMANT",distress:"CRISIS",mediaReach:0,
  rosterCount:0,rosterUsed:0,renewalAccepted:0,renewalRejected:0,
  restructures:1,terminations:2});
 assert.equal(collapsed.talentReputation,61);
 assert.ok(collapsed.prestige<82);
 assert.ok(collapsed.businessReputation<82);
 assert.ok(collapsed.fanReputation<78);
 const boosted=evaluateAnnualStanding(
  {...old,prestige:20},
  {...evidence,tier:"GLOBAL",championshipPrestige:100,
   majorScore:100,topFiveLoyalty:100,meanCrowd:100,meanDemand:100});
 assert.ok(boosted.prestige>20,"Higher evidence uses the original 18% rise blend");
});
test("incomplete annual facts fail closed instead of inventing scores",()=>{
 assert.throws(()=>evaluateAnnualStanding(old,{...evidence,
  completed:1,meanDemand:null}),/Incomplete verified/);
 assert.throws(()=>evaluateAnnualStanding(old,{...evidence,
  majorCount:1,majorScore:null}),/Incomplete verified/);
 assert.throws(()=>evaluateAnnualStanding(old,{...evidence,
  rosterUsed:11}),/Incomplete verified/);
});
