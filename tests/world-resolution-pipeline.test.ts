import test from "node:test";
import assert from "node:assert/strict";
import {inspectWorldResolutionReadiness,runWorldShowResolutionPhase,publishResolvedWorldWeek,planNextWorldResolutionAction,executeNextWorldResolutionStage,driveWorldResolution}
 from "../src/db/world-resolution-pipeline.js";
import type {TransactionPool} from "../src/db/transaction.js";
function fixture(config:{phase?:string;active?:number;submitted?:number;
 cleared?:number|null;legacy?:number;detailed?:number;eligible?:number}={}){
 const queries:string[]=[];
 const pool:TransactionPool={async connect(){return {
  async query<T extends Record<string,unknown>>(sql:string){
   queries.push(sql);
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   if(sql.includes("FROM ppw_worlds"))return [{revision:0,year:1,week:1,
    phase:config.phase??"RESOLVING"}] as unknown as T[];
   if(sql.includes("AS done"))return [{done:false,eligible:config.eligible??1}] as unknown as T[];
   if(sql.includes("AS active"))return [{
    active:config.active??2,submitted:config.submitted??2,
    cleared:config.cleared===undefined?2:config.cleared,
    certified:null,legacy_resolved:config.legacy??0,
    detailed_resolved:config.detailed??0}] as unknown as T[];
   throw new Error("Unexpected query: "+sql);
  },release(){}};
 }};
 return {pool,queries};
}
const scope={worldId:"world",year:1,week:1,resolutionId:"week-1"};
test("readiness reports missing clearance and submissions without mutating",async()=>{
 const db=fixture({submitted:1,cleared:null});
 const state=await inspectWorldResolutionReadiness(db.pool,"world");
 assert.deepEqual(state.blockers,["SHOWS_NOT_SUBMITTED","RESOURCES_NOT_CLEARED"]);
 assert.equal(db.queries.some(x=>x.startsWith("INSERT")),false);
});
test("resolution phase refuses legacy date-charge omissions",async()=>{
 const db=fixture({legacy:1});
 await assert.rejects(runWorldShowResolutionPhase(db.pool,scope),
  /Legacy date-charge resolution incomplete/);
});
test("resolution phase refuses unresolved staff and AI shows",async()=>{
 const db=fixture({submitted:1,legacy:2});
 await assert.rejects(runWorldShowResolutionPhase(db.pool,scope),
  /SHOWS_NOT_SUBMITTED/);
});
test("resolution phase refuses a World outside RESOLVING",async()=>{
 const db=fixture({phase:"LOCKED",legacy:2});
 await assert.rejects(runWorldShowResolutionPhase(db.pool,scope),
  /WORLD_NOT_RESOLVING/);
});

test("publication refuses missing detailed results",async()=>{
 const db=fixture({legacy:2,detailed:1});
 await assert.rejects(publishResolvedWorldWeek(db.pool,{
  worldId:"world",year:1,week:1,requestId:"publish",expectedRevision:0,
 }),/incomplete results or certification/);
});
test("publication refuses unsubmitted shows",async()=>{
 const db=fixture({submitted:1,legacy:2,detailed:2});
 await assert.rejects(publishResolvedWorldWeek(db.pool,{
  worldId:"world",year:1,week:1,requestId:"publish",expectedRevision:0,
 }),/SHOWS_NOT_SUBMITTED/);
});

test("planner points incomplete resolved weeks to missing promotion cards",async()=>{
 const db=fixture({submitted:1,legacy:0});
 const plan=await planNextWorldResolutionAction(db.pool,"world");
 assert.equal(plan.action,"GENERATE_STAFF_AND_AI_CARDS");
 assert.deepEqual(plan.blockers,["MISSING_PROMOTION_SHOWS"]);
});
test("planner requires legacy accounting before detailed show resolution",async()=>{
 const db=fixture({legacy:1});
 const plan=await planNextWorldResolutionAction(db.pool,"world");
 assert.equal(plan.action,"RESOLVE_LEGACY_SHOWS");
});
test("planner requires certification after all receipts",async()=>{
 const db=fixture({legacy:2,detailed:2});
 const plan=await planNextWorldResolutionAction(db.pool,"world");
 assert.equal(plan.action,"CERTIFY_WEEK");
});

test("executor routes legacy show receipts to authoritative accounting",async()=>{
 const db=fixture({legacy:0});
 await assert.rejects(executeNextWorldResolutionStage(db.pool,{
  worldId:"world",requestId:"stage",expectedRevision:0,resolutionId:"resolve"}),
  /Unexpected query: SELECT p.promotion_id/);
 assert.equal(db.queries.some(x=>x.startsWith("INSERT")),false);
});
test("executor refuses to bypass missing staff preparation",async()=>{
 const db=fixture({submitted:1});
 const plan=await planNextWorldResolutionAction(db.pool,"world");
 assert.equal(plan.action,"GENERATE_STAFF_AND_AI_CARDS");
 assert.equal(plan.ready.submitted,1);
});

test("bounded driver routes to legacy accounting without advancing on failure",async()=>{
 const db=fixture({legacy:0});
 await assert.rejects(driveWorldResolution(db.pool,{
  worldId:"world",resolutionId:"resolution",maxStages:4}),
  /Unexpected query: SELECT p.promotion_id/);
 assert.equal(db.queries.some(x=>x.startsWith("UPDATE")),false);
});
test("driver rejects unbounded stage execution",async()=>{
 const db=fixture();
 await assert.rejects(driveWorldResolution(db.pool,{
  worldId:"world",resolutionId:"resolution",maxStages:100}),/Invalid World driver scope/);
});

test("planner blocks absent show without explicit delegated staff instead of throwing",async()=>{
 const db=fixture({submitted:1,eligible:0});
 const plan=await planNextWorldResolutionAction(db.pool,"world");
 assert.equal(plan.action,"ARBITRATE_OR_REMEDIATE");
 assert.deepEqual(plan.blockers,["MISSING_PROMOTION_SHOWS_NO_DELEGATED_STAFF_OR_AI"]);
 const run=await driveWorldResolution(db.pool,{worldId:"world",
  resolutionId:"missing",maxStages:3});
 assert.equal(run.status,"BLOCKED");
 assert.deepEqual(run.steps.map(x=>x.action),["ARBITRATE_OR_REMEDIATE"]);
});
