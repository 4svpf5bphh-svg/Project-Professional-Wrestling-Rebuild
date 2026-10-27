
import test from "node:test";
import assert from "node:assert/strict";
import {settleCanonicalAuthoredTurns} from "../src/db/segment-alignment-settlement.js";
import type {SqlRows} from "../src/db/world-operations.js";
import type {SegmentCrowdContext} from "../src/simulation/legacy/segment-crowd.js";
const input={worldId:"world",promotionId:"promotion",year:1,week:3};
const make=(outcome:"HAPPENS"|"REFUSED",to:"FACE"|"HEEL"|"TWEENER"|undefined):
 SegmentCrowdContext=>({segment:{slotId:"turn",kind:"TURN",position:0,actorIds:["a"],
 targetIds:[],outcome,...(to?{turnTargetAlignment:to}:{})},
 performers:[{personId:"a",popularity:60,presentation:60,momentum:60}],
 storylineHeat:50,repetitionCount:0});
test("completed scripted turn applies the exact chosen world alignment",async()=>{
 const sql:string[]=[];
 const tx:SqlRows={async query<T extends Record<string,unknown>>(statement:string){
  sql.push(statement);
  if(statement.includes("SELECT person_id,default_alignment"))return [
   {person_id:"a",default_alignment:"FACE"}] as unknown as T[];
  if(statement.includes("UPDATE ppw_people"))return [{person_id:"a"}] as unknown as T[];
  if(statement.includes("INSERT INTO ppw_promotion_alignment_changes"))
   return [{person_id:"a"}] as unknown as T[];
  throw Error("Unexpected SQL");
 }};
 assert.deepEqual(await settleCanonicalAuthoredTurns(tx,input,[make("HAPPENS","HEEL")]),
  {changed:1});
 assert.equal(sql.length,3);
 assert.match(sql[1]!,/IS NOT DISTINCT FROM/);
 assert.match(sql[2]!,/method,changed/);
});
test("refused and unspecified historical turns never change alignment",async()=>{
 const tx:SqlRows={async query(){throw Error("No database access expected");}};
 assert.deepEqual(await settleCanonicalAuthoredTurns(tx,input,[make("REFUSED","HEEL")]),
  {changed:0});
 assert.deepEqual(await settleCanonicalAuthoredTurns(tx,input,[make("HAPPENS",undefined)]),
  {changed:0});
});


test("a scripted tag-team turn applies to both wrestlers in one world transaction",async()=>{
 const sql:string[]=[];
 const args:unknown[][]=[];
 const tx:SqlRows={async query<T extends Record<string,unknown>>(statement:string,values:readonly unknown[]){
  sql.push(statement);args.push([...values]);
  if(statement.includes("SELECT person_id,default_alignment"))return [
   {person_id:"a",default_alignment:"FACE"},
   {person_id:"b",default_alignment:"TWEENER"}] as unknown as T[];
  if(statement.includes("UPDATE ppw_people"))return [
   {person_id:"a"},{person_id:"b"}] as unknown as T[];
  if(statement.includes("INSERT INTO ppw_promotion_alignment_changes"))return [
   {person_id:"a"},{person_id:"b"}] as unknown as T[];
  throw Error("Unexpected SQL");
 }};
 const turn=make("HAPPENS","HEEL");
 const team={...turn,segment:{...turn.segment,actorIds:["a","b"]}};
 assert.deepEqual(await settleCanonicalAuthoredTurns(tx,input,[team]),{changed:2});
 assert.equal(sql.length,3);
 const changes=JSON.parse(args[1]![1] as string);
 assert.deepEqual(changes.map((p:{person_id:string})=>p.person_id),["a","b"]);
 assert.ok(changes.every((p:{next_alignment:string})=>p.next_alignment==="HEEL"));
});
