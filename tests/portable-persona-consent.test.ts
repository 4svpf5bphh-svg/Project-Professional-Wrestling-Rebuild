import test from "node:test";
import assert from "node:assert/strict";
import {evaluatePersonaConsent} from "../src/domain/portable-persona-consent.js";
const input={worldSeed:"11",personId:"p",realName:"The Undertaker",
 currentGimmickId:"DEADMAN",requestedGimmickId:"COWBOY",
 popularity:93,recognition:98,morale:78,creativeControl:"FULL_APPROVAL" as const,
 weeksSinceChange:100,weekIndex:100};
test("iconic wrestler-owned gimmick has meaningful resistance",()=>{
 const first=evaluatePersonaConsent(input);
 assert.deepEqual(first,evaluatePersonaConsent(input));
 assert.ok(first.assessedResistance>=80);
});
test("creative rights increase resistance but cannot rewrite authored results",()=>{
 const ordinary={...input,realName:"Newcomer",currentGimmickId:"SPORTING",
  popularity:62,recognition:58,weeksSinceChange:8};
 const full=evaluatePersonaConsent(ordinary).assessedResistance;
 assert.ok(full>evaluatePersonaConsent({...ordinary,creativeControl:"NONE"}).assessedResistance);
 assert.throws(()=>evaluatePersonaConsent({...input,popularity:NaN}),/Missing/);
});
test("character proposals never reroll within the same World week",()=>{
 const x=evaluatePersonaConsent({...input,personId:"unique",realName:"John",
  currentGimmickId:"AUTHENTIC",popularity:20,recognition:15,
  creativeControl:"NONE",weeksSinceChange:1});
 assert.deepEqual(x,evaluatePersonaConsent({...input,personId:"unique",realName:"John",
  currentGimmickId:"AUTHENTIC",popularity:20,recognition:15,
  creativeControl:"NONE",weeksSinceChange:1}));
});
