import test from "node:test";
import assert from "node:assert/strict";
import {recommendTalentOffer} from "../src/domain/talent-offer-advice.js";
import type {TalentOfferProfile} from "../src/domain/talent-offer-advice.js";
const candidate:TalentOfferProfile={personId:"perfect",name:"Mr Perfect",
 marketWeeklyValue:12500,popularity:90,recognition:94,morale:76,
 careerStage:"PRIME",interest:"INTERESTED"};
test("Talent Manager recommends a real contract shape and protected creative finish for a star",()=>{
 const manager={staffId:"a",name:"Morgan Keane",insight:95};
 const rec=recommendTalentOffer(candidate,manager);
 assert.equal(rec.managerName,"Morgan Keane");
 assert.match(rec.voice,/Mr Perfect/);
 assert.match(rec.voice,/protection over how they lose/);
 assert.equal(rec.terms.creativeControl,"PROTECTED_FINISHES");
 assert.equal(rec.terms.roleExpectation,"MAIN_EVENT");
 assert.equal(rec.terms.termWeeks,52);
 assert.equal(rec.terms.dateEntitlement,40);
 assert.equal(rec.confidence,"CONFIDENT");
 assert.ok(rec.projectedCommitment>0);
 assert.deepEqual(rec,recommendTalentOffer(candidate,manager));
});
test("higher Talent Manager skill narrows estimation error without exposing the acceptance formula",()=>{
 const weak=recommendTalentOffer(candidate,{staffId:"weak",name:"Jamie",insight:20});
 const expert=recommendTalentOffer(candidate,{staffId:"expert",name:"Morgan",insight:95});
 const equivalent=(p:typeof weak)=>p.terms.weeklyGuarantee+
  p.terms.appearanceFee*p.terms.dateEntitlement/p.terms.termWeeks;
 const ideal=12500*.95*(.24+.83*40/52);
 assert.ok(Math.abs(equivalent(expert)-ideal)<
  Math.abs(equivalent(weak)-ideal));
 assert.equal(weak.confidence,"SPECULATIVE");
 assert.equal(expert.confidence,"CONFIDENT");
});
