import test from "node:test";
import assert from "node:assert/strict";
import {originalPersonaBaseline,validatePortablePersona,
 wrestlerIdentityReference} from "../src/domain/portable-persona.js";
import {FULL_REAL_ROSTER_IDENTITY_GUIDE} from "../src/content/full-real-roster-identity-guide.js";
test("the original 643 wrestler guide is complete with signatures and finishers",()=>{
 assert.equal(FULL_REAL_ROSTER_IDENTITY_GUIDE.length,643);
 assert.ok(FULL_REAL_ROSTER_IDENTITY_GUIDE.every(x=>x.signatureMoves.length>0&&
  x.finishingMoves.length>0&&x.primaryStyle));
});
test("original roster identity is stable across promotions and names",()=>{
 const a=originalPersonaBaseline("Roman Reigns",null);
 const b=originalPersonaBaseline("Roman Reigns",null);
 assert.deepEqual(a,b);
 assert.notEqual(a.source,"CURATED","Editorial approximations do not masquerade as independent fact checks");
 assert.ok(a.signatureMoves.length>0);
 assert.equal(originalPersonaBaseline("Unknown Future Prospect",null).signatureMoves.length,0);
 assert.equal(originalPersonaBaseline("Unknown Future Prospect",null).primaryStyle,null);
});
test("legacy wrestler-owned character overrides guide without creating a fictional history",()=>{
 const p=originalPersonaBaseline("Roman Reigns","HERO");
 assert.equal(p.gimmickId,"HERO");
 assert.equal(p.source,"LEGACY_MIGRATED");
});
test("named iconic gimmicks remain reserved to their original person",()=>{
 const c=wrestlerIdentityReference("Cody Rhodes").archetypes.map(x=>x.id);
 assert.ok(c.includes("AMERICAN_NIGHTMARE"));
 assert.ok(!wrestlerIdentityReference("Roman Reigns").archetypes.some(
  x=>x.id==="AMERICAN_NIGHTMARE"));
 assert.throws(()=>validatePortablePersona({...originalPersonaBaseline("Roman Reigns",null),
  gimmickId:"DEADMAN"},"Roman Reigns"),/wrestler-owned/);
});
