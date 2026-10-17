import test from "node:test";
import assert from "node:assert/strict";
import {programmeIdentity,validateProgrammeSides} from "../src/domain/programme-lifecycle.js";
const a={kind:"PERSON" as const,refId:"a"},b={kind:"PERSON" as const,refId:"b"};
test("programme identity ignores sides and within-side order",()=>{
 const x=programmeIdentity({sideA:[a],sideB:[b]});
 assert.equal(x,programmeIdentity({sideA:[b],sideB:[a]}));
 const p={sideA:[a,{kind:"TEAM" as const,refId:"tag"}],sideB:[b]};
 assert.equal(programmeIdentity(p),programmeIdentity({
  sideA:p.sideB,sideB:[p.sideA[1]!,p.sideA[0]!] }));
});
test("sides enforce original two-to-four participant rules",()=>{
 assert.throws(()=>validateProgrammeSides({sideA:[],sideB:[b]}),/one or two/);
 assert.throws(()=>validateProgrammeSides({sideA:[a,a],sideB:[b]}),/same participant/);
 assert.throws(()=>validateProgrammeSides({sideA:[a,b,b],sideB:[a]}),/one or two/);
});
