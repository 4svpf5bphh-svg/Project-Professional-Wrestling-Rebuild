import test from "node:test";
import assert from "node:assert/strict";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {projectOriginalGenesis} from "../src/domain/original-genesis-projection.js";
import {extractOriginalMainFreshGenesis,type OriginalMainFreshState}
 from "../src/domain/original-main-fresh-export.js";
import {parseOriginalExportArgs,verifyOriginalMainRepository}
 from "../scripts/playtest-export-original.js";

function freshOriginalState():OriginalMainFreshState{
 const f=originalGenesisFixture("original-fresh");
 const originalEight=f.promotions.map((p,i)=>({
  ...p,identity:{origin:"REAL_WORLD" as const},
  playerTakeoverEligibility:"LOCKED" as const
 }));
 const extra=Array.from({length:5},(_,i)=>{
  const seed=f.promotions[i+3]!;
  return {...seed,id:"fictional-"+i,name:"Independent "+i,
   identity:{origin:"FICTIONAL" as const},playerTakeoverEligibility:"STANDARD" as const};
 });
 const promotions=[...originalEight,...extra];
 const standings=[...f.promotionStandings,...extra.map((p,i)=>({
  ...f.promotionStandings[i+3]!,promotionId:p.id
 }))];
 const markets=[...f.promotionMarketStates,...extra.flatMap((p,i)=>
  f.markets.map(m=>({
   ...f.promotionMarketStates.find(x=>x.promotionId===f.promotions[i+3]!.id&&
    x.marketId===m.id)!,promotionId:p.id
  })))];
 const identities=f.people.map(p=>({
  personId:p.id,active:{
   gimmickId:"HERO",personaName:p.name,
   primaryStyle:"ALL_ROUNDER",secondaryStyle:"TECHNICAL",
   signatureMoves:[{name:"Suplex",category:"GRAPPLE" as const,source:"PPW_AUTHORED" as const}],
   finishingMoves:[{name:"Flying Lariat",category:"STRIKE" as const,source:"PPW_AUTHORED" as const}],
   provenance:"CURATED" as const
  }
 }));
 const people=f.people.map(p=>({
  ...p,division:p.bookingDivision,
  bookingDivision:undefined,portableGimmickId:undefined
 }));
 return {...f,promotions,promotionStandings:standings,
  promotionMarketStates:markets,people,wrestlerIdentities:identities,
  teams:[{worldId:f.world.id,id:"original-team",name:"Actual Partners",status:"ACTIVE"}],
  teamMemberships:[{worldId:f.world.id,teamId:"original-team",personId:people[0]!.id,active:true},
   {worldId:f.world.id,teamId:"original-team",personId:people[1]!.id,active:true}]};
}
test("true original-main WorldState produces exact real-world population and protects WWE-sized companies",()=>{
 const state=freshOriginalState();
 const raw=JSON.stringify(state);
 const out=extractOriginalMainFreshGenesis(state);
 assert.equal(out.people.length,643);
 assert.equal(out.promotions.length,13);
 assert.equal(out.promotions.filter(x=>x.playerTakeoverEligibility==="LOCKED").length,8);
 assert.equal(out.promotions.filter(x=>x.playerTakeoverEligibility==="STANDARD").length,5);
 assert.equal(out.people[0]?.portableGimmickId,"HERO");
 assert.equal(out.personas?.length,643);
 assert.equal(out.personas?.[0]?.persona.finishingMoves[0]?.name,"Flying Lariat");
 assert.equal(projectOriginalGenesis(out).personas.length,643);
 assert.equal(out.people[0]?.bookingDivision,"WOMEN");
 assert.equal(projectOriginalGenesis(out).contracts.length,400);
 assert.equal(projectOriginalGenesis(out).teams[0]?.name,"Actual Partners");
 assert.equal(projectOriginalGenesis(out).teamMemberships.length,2);
 assert.equal(JSON.stringify(state),raw,
  "Export must not alter the original WorldState or its identities");
});
test("missing or forged tag affiliations never become fake live teams",()=>{
 const missing=freshOriginalState();
 missing.teamMemberships=[];
 assert.throws(()=>extractOriginalMainFreshGenesis(missing),/tag teams have not been seeded/);
 const outsider=freshOriginalState();
 outsider.teamMemberships![0]!.personId="not-in-world";
 assert.throws(()=>extractOriginalMainFreshGenesis(outsider),/Invalid original tag team member/);
});
test("missing portable identity, standings and forged unlocked real company block export",()=>{
 const missing=freshOriginalState();
 missing.wrestlerIdentities!.pop();
 assert.throws(()=>extractOriginalMainFreshGenesis(missing),/missing portable wrestler identities/);
 const ratings=freshOriginalState();
 ratings.promotionStandings!.pop();
 assert.throws(()=>extractOriginalMainFreshGenesis(ratings),/complete promotion standings/);
 const bypass=freshOriginalState();
 bypass.promotions[0]!.playerTakeoverEligibility="STANDARD";
 assert.throws(()=>extractOriginalMainFreshGenesis(bypass),/Incomplete original promotion/);
});
test("only clean original main can produce an offline file; alpha-1a and replicas are rejected",()=>{
 const args=parseOriginalExportArgs(["--original-root","/src/original",
  "--out","/tmp/new.json","--seed","7321"]);
 assert.equal(args.seed,7321);
 assert.equal(args.name,"PPW Rebuild Playtest");
 for(const a of [
  ["--original-root","/src","--out","foo","--seed","-1"],
  ["--original-root","/src","--out","foo","--seed","4294967296"],
  ["--original-root","/src","--out","foo","--seed","5","--seed","6"],
 ])assert.throws(()=>parseOriginalExportArgs(a));
 const good=(...git:string[])=>{
  if(git.includes("--show-current"))return "main\n";
  if(git.includes("get-url"))return "git@github.com:4svpf5bphh-svg/Project-Professional-Wrestling.git\n";
  if(git.includes("--porcelain"))return "";
  return "a".repeat(40)+"\n";
 };
 assert.equal(verifyOriginalMainRepository("/src/original",good),"a".repeat(40));
 assert.throws(()=>verifyOriginalMainRepository("/src/original",(...a)=>
  a.includes("--show-current")?"alpha-1a":good(...a)),/never alpha-1a/);
 assert.throws(()=>verifyOriginalMainRepository("/src/original",(...a)=>
  a.includes("get-url")?"https://github.com/other/Project-Professional-Wrestling":good(...a)),
  /exact original/);
 assert.throws(()=>verifyOriginalMainRepository("/src/original",(...a)=>
  a.includes("--porcelain")?" M packages/sim-core/src/genesis.ts":good(...a)),
  /uncommitted changes/);
});
