import {test} from "node:test";
import {strict as assert} from "node:assert";
import {settleCanonicalSegmentProgrammeEffects} from "../src/db/segment-programme-settlement.js";
import type {SqlRows} from "../src/db/world-operations.js";
const input={worldId:"world",promotionId:"prom",showId:"show"};
const receipt={worldId:"world",promotionId:"prom",showId:"show",year:1,week:1,
 resolutionId:"resolution",crowdResponse:70,matches:[],segments:[
 {slotId:"a",position:0,kind:"PROMO",outcome:"HAPPENS" as const,crowdResponse:80},
 {slotId:"b",position:1,kind:"ATTACK",outcome:"REFUSED" as const,crowdResponse:20},
 ]};
test("only successful, explicitly linked angles modify programme reaction",async()=>{
 const calls:{sql:string;args:readonly unknown[]}[]=[];
 const tx:SqlRows={async query<T extends Record<string,unknown>>(
  sql:string,args:readonly unknown[]=[]){
  calls.push({sql,args});
  if(sql.includes("SELECT a.programme_id"))return [{programme_id:"feud",slot_id:"a"}] as unknown as T[];
  if(sql.includes("UPDATE ppw_programmes"))return [{programme_id:"feud"}] as unknown as T[];
  throw Error("Unexpected SQL");
 }};
 const result=await settleCanonicalSegmentProgrammeEffects(tx,input,receipt);
 assert.deepEqual(result,{programmes:1,activities:1});
 assert.deepEqual(calls[0]!.args[3],["a"]);
 assert.match(JSON.stringify(calls[1]!.args),/activity_count/);
});
test("refused and interrupted only angles never mutate storyline state",async()=>{
 const tx:SqlRows={async query(){throw Error("No writes permitted");}};
 assert.deepEqual(await settleCanonicalSegmentProgrammeEffects(tx,input,{
  ...receipt,segments:[{...receipt.segments[0]!,outcome:"INTERRUPTED"}],
 }),{programmes:0,activities:0});
});
