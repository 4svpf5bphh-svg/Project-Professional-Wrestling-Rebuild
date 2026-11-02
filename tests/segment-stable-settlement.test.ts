import test from "node:test";
import assert from "node:assert/strict";
import {settleCertifiedStableStories} from "../src/db/segment-stable-settlement.js";
import type {SqlRows} from "../src/db/world-operations.js";
import type {SegmentCrowdContext} from "../src/simulation/legacy/segment-crowd.js";
const scope={worldId:"w",promotionId:"p",showId:"show",year:1,week:4};
function segment(kind:"STABLE_INVITATION"|"STABLE_EXIT"|"STABLE_RECONCILIATION",
 outcome:"HAPPENS"|"REFUSED"|"INTERRUPTED"="HAPPENS",
 decision?:"ACCEPTED"|"REJECTED",slotId="slot"):SegmentCrowdContext{
 return {segment:{slotId,position:0,kind,outcome,
  stableId:"stable",actorIds:["leader"],targetIds:["prospect"],
  ...(decision?{stableDecision:decision}:{})},
  performers:[],storylineHeat:50,repetitionCount:0};
}
function fake(input:{members?:{stable_id:string;person_id:string}[];
 count?:number;status?:string;contract?:boolean}={}){
 const calls:string[]=[];const params:unknown[][]=[];
 const tx:SqlRows={async query<T extends Record<string,unknown>>(sql:string,values?:readonly unknown[]){
  calls.push(sql);params.push([...(values??[])]);
  if(sql.includes("FROM ppw_stables s"))return [{stable_id:"stable",
   status:input.status??"ACTIVE",member_count:input.count??1}] as unknown as T[];
  if(sql.includes("FROM ppw_stable_memberships")&&sql.includes("FOR UPDATE"))
   return (input.members??[{stable_id:"stable",person_id:"leader"}]) as unknown as T[];
  if(sql.includes("FROM ppw_contracts c"))
   return (input.contract===false?[]:[{person_id:"prospect"}]) as unknown as T[];
  if(sql.includes("UPDATE ppw_stable_memberships"))return [
   {person_id:"leader"}] as unknown as T[];
  if(sql.includes("INSERT INTO ppw_stable_memberships"))return [
   {person_id:"prospect"}] as unknown as T[];
  if(sql.includes("INSERT INTO ppw_ledger_events")){
   const batch=JSON.parse(values?.[5] as string) as {event_type:string}[];
   return batch.map(x=>({event_type:x.event_type})) as unknown as T[];
  }
  throw new Error("Unexpected faction SQL: "+sql);
 }};
 return {tx,calls,params};
}
test("a certified accepted faction invitation joins its wrestler atomically with event history",async()=>{
 const db=fake();const r=await settleCertifiedStableStories(db.tx,scope,[
  segment("STABLE_INVITATION","HAPPENS","ACCEPTED")]);
 assert.deepEqual(r,{joined:1,left:0,skipped:0});
 assert.equal(db.calls.filter(x=>x.includes("INSERT INTO ppw_stable_memberships")).length,1);
 assert.ok(db.calls.some(x=>x.includes("STABLE_MEMBER_JOINED")||x.includes("ppw_ledger_events")));
});
test("refused, interrupted and unanswered angles never open a faction SQL transaction",async()=>{
 const db=fake();
 const result=await settleCertifiedStableStories(db.tx,scope,[
  segment("STABLE_INVITATION","HAPPENS","REJECTED","no"),
  segment("STABLE_INVITATION","REFUSED","ACCEPTED","refused"),
  segment("STABLE_RECONCILIATION","INTERRUPTED","ACCEPTED","interrupted"),
  segment("STABLE_RECONCILIATION","HAPPENS",undefined,"no-answer")
 ]);
 assert.deepEqual(result,{joined:0,left:0,skipped:0});
 assert.equal(db.calls.length,0);
});
test("a certified expulsion removes the wrestler; optional beating victim is not expelled",async()=>{
 const db=fake({members:[{stable_id:"stable",person_id:"leader"},
  {stable_id:"stable",person_id:"prospect"}],count:2});
 const r=await settleCertifiedStableStories(db.tx,scope,[
  segment("STABLE_EXIT","HAPPENS",undefined,"expel")]);
 assert.deepEqual(r,{joined:0,left:1,skipped:0});
 const update=db.calls.findIndex(x=>x.includes("UPDATE ppw_stable_memberships"));
 assert.ok(update>=0);
 const moves=JSON.parse(db.params[update]![3] as string);
 assert.equal(moves[0].personId,"leader");
});
test("full faction and conflicting membership do not rewrite a resolved result",async()=>{
 const full=fake({count:12});
 assert.deepEqual(await settleCertifiedStableStories(full.tx,scope,[
  segment("STABLE_INVITATION","HAPPENS","ACCEPTED")]),
 {joined:0,left:0,skipped:1});
 assert.equal(full.calls.some(x=>x.includes("INSERT INTO ppw_stable_memberships")),false);
 const other=fake({members:[{stable_id:"other",person_id:"prospect"}]});
 assert.deepEqual(await settleCertifiedStableStories(other.tx,scope,[
  segment("STABLE_RECONCILIATION","HAPPENS","ACCEPTED")]),
 {joined:0,left:0,skipped:1});
});

test("an on-screen faction beatdown expels the named target, not the faction leader",async()=>{
 const db=fake({members:[{stable_id:"stable",person_id:"leader"},
  {stable_id:"stable",person_id:"prospect"}],count:2});
 const base=segment("STABLE_EXIT","HAPPENS",undefined,"expulsion");
 const physical={...base,segment:{...base.segment,
  creativeBeat:{kind:"STABLE_EXIT" as const,departure:"BEATDOWN" as const}}};
 const result=await settleCertifiedStableStories(db.tx,scope,[physical]);
 assert.deepEqual(result,{joined:0,left:1,skipped:0});
 const update=db.calls.findIndex(x=>x.includes("UPDATE ppw_stable_memberships"));
 const moves=JSON.parse(db.params[update]![3] as string);
 assert.equal(moves[0].personId,"prospect");
});
