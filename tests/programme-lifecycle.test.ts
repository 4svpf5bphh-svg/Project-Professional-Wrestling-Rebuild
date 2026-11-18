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

test("non-rival journeys validate exact actor count and preserve rivalry identities",()=>{
 const c={kind:"PERSON" as const,refId:"c"};
 const d={kind:"PERSON" as const,refId:"d"};
 const e={kind:"PERSON" as const,refId:"e"};
 for(const [format,people] of [
  ["SOLO",[a]],["RELATIONSHIP",[a,b]],["FACTION",[a,b,c,d,e]]
 ] as const){
  const story={sideA:people,sideB:[]};
  assert.equal(validateProgrammeSides(story,format).sideB.length,0);
  assert.equal(programmeIdentity(story,format),
   programmeIdentity({sideA:[...people].reverse(),sideB:[]},format));
 }
 assert.notEqual(programmeIdentity({sideA:[a],sideB:[b]}),
  programmeIdentity({sideA:[a,b],sideB:[]},"RELATIONSHIP"));
 assert.throws(()=>validateProgrammeSides({sideA:[a],sideB:[b]},"SOLO"),/no opponent/);
 assert.throws(()=>validateProgrammeSides({sideA:[a,b,c],sideB:[]},"SOLO"),/one wrestler/);
 assert.throws(()=>validateProgrammeSides({sideA:[a],sideB:[]},"RELATIONSHIP"),/two to four/);
 assert.throws(()=>validateProgrammeSides({sideA:[a,b],sideB:[]},"FACTION"),/three to five/);
 assert.throws(()=>validateProgrammeSides({sideA:[{kind:"TEAM",refId:"duo"}],sideB:[]},"SOLO"),/individual/);
 assert.throws(()=>validateProgrammeSides({sideA:[a,b,b],sideB:[]},"RELATIONSHIP"),/same participant/);
});
