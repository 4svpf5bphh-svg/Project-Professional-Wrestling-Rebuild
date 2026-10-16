import test from "node:test";
import assert from "node:assert/strict";
import {inspectWorldResolutionReadiness,runWorldShowResolutionPhase,publishResolvedWorldWeek}
 from "../src/db/world-resolution-pipeline.js";
import type {TransactionPool} from "../src/db/transaction.js";
function fixture(config:{phase?:string;active?:number;submitted?:number;
 cleared?:number|null;legacy?:number;detailed?:number}={}){
 const queries:string[]=[];
 const pool:TransactionPool={async connect(){return {
  async query<T extends Record<string,unknown>>(sql:string){
   queries.push(sql);
   if(["BEGIN","COMMIT","ROLLBACK"].includes(sql))return [] as T[];
   if(sql.includes("FROM ppw_worlds"))return [{year:1,week:1,
    phase:config.phase??"RESOLVING"}] as unknown as T[];
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
