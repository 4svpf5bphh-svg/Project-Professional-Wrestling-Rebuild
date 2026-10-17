import test from "node:test";
import assert from "node:assert/strict";
import {refreshWorldProgrammeSignals} from "../src/db/programme-week-signals.js";
import type {SqlRows} from "../src/db/world-operations.js";
test("inactive-storyline heat decays from factual activity; never fabricates new heat",async()=>{
 const queries:string[]=[];
 const tx:SqlRows={async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
  queries.push(sql);
  if(sql.includes("FROM ppw_programmes")&&!sql.includes("UPDATE"))return [
   {promotion_id:"p",programme_id:"quiet",heat:85,repetition:30},
   {promotion_id:"p",programme_id:"new",heat:null,repetition:0},
  ] as unknown as T[];
  if(sql.includes("FROM ppw_programme_resolved_activities"))return [] as unknown as T[];
  if(sql.includes("UPDATE ppw_programmes")){
   const updates=JSON.parse(params[1] as string) as {programme_id:string;heat:number|null}[];
   assert.deepEqual(updates,[{promotion_id:"p",programme_id:"quiet",heat:10,repetition:0}]);
   return [{programme_id:"quiet"}] as unknown as T[];
  }
  throw Error("Unexpected SQL");
 }};
 assert.deepEqual(await refreshWorldProgrammeSignals(tx,"w",20),{examined:2,changed:1});
 assert.equal(queries.length,3);
});
test("empty World programme set costs only one indexed read",async()=>{
 let count=0;const tx:SqlRows={async query(){count++;return [];}};
 assert.deepEqual(await refreshWorldProgrammeSignals(tx,"w",0),{examined:0,changed:0});
 assert.equal(count,1);
});
