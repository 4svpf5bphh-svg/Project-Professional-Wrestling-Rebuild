import test from "node:test";
import assert from "node:assert/strict";
import type {SqlRows} from "../src/db/world-operations.js";
import {publishBackstageRivalryPitches} from "../src/db/backstage-rivalry-pitches.js";

test("no historic singles matches can trigger a Week 1 wrestler-led rivalry pitch",async()=>{
 const rows:SqlRows={query:async()=>{throw Error("No SQL needed for an empty prehistory");}};
 assert.deepEqual(await publishBackstageRivalryPitches(rows,"genesis",0),{newPitches:0});
 await assert.rejects(()=>publishBackstageRivalryPitches(rows,"",0),/Invalid Backstage rivalry week/);
});
test("wrestler-led rivalry scans only historical human-controlled certified shows",async()=>{
 const sql:string[]=[];
 const rows:SqlRows={query:async(statement,params)=>{
  sql.push(statement);
  assert.deepEqual(params,["genesis",15,1,4,1,15]);
  return [];
 }};
 assert.deepEqual(await publishBackstageRivalryPitches(rows,"genesis",15),
  {newPitches:0});
 assert.equal(sql.length,1,"The ordinary rival-pitch path remains one bounded query");
 const command=sql[0]!;
 assert.match(command,/WITH human_promotions AS MATERIALIZED/);
 assert.match(command,/SELECT DISTINCT owner\.promotion_id/);
 assert.match(command,/FROM human_promotions human/);
 assert.match(command,/JOIN ppw_completed_shows sh ON sh\.world_id=\$1/);
 assert.match(command,/\(sh\.year,sh\.week\) BETWEEN \(\$3::integer,\$4::integer\)/);
 assert.match(command,/AND \(\$5::integer,\$6::integer\)/);
 assert.doesNotMatch(command,/\(sh\.year-1\)\*52/);
 assert.match(command,/member\.status='ACTIVE'/);
 assert.match(command,/played\.world_id=sh\.world_id/);
 assert.match(command,/count\(DISTINCT c\.show_id\)>=2/);
 assert.match(command,/ON CONFLICT DO NOTHING/);
});

test("indexed historic show window includes year boundaries without future matches",async()=>{
 const cases:[number,[number,number,number,number]][]=[
  [1,[1,1,1,1]], [15,[1,4,1,15]], [52,[1,41,1,52]],
  [53,[1,42,2,1]], [63,[1,52,2,11]],
  [104,[2,41,2,52]], [105,[2,42,3,1]],
  [156,[3,41,3,52]],
 ];
 for(const [weekIndex,expected] of cases){
  let calls=0;
  const rows:SqlRows={query:async(statement,params)=>{
   calls++;
   assert.match(statement,/\(sh\.year,sh\.week\) BETWEEN/);
   assert.deepEqual(params,["genesis",weekIndex,...expected]);
   return [];
  }};
  assert.deepEqual(await publishBackstageRivalryPitches(rows,"genesis",weekIndex),
   {newPitches:0});
  assert.equal(calls,1);
 }
});
