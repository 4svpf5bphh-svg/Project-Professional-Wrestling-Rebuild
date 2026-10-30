import test from "node:test";
import assert from "node:assert/strict";
import type {SqlRows} from "../src/db/world-operations.js";
import {publishBackstageTagPitches} from "../src/db/backstage-tag-pitches.js";

test("the first World week cannot propose a tag team before any certified shows",async()=>{
 const tx:SqlRows={query:async()=>{throw Error("Tag pitches must not query genesis history");}};
 assert.deepEqual(await publishBackstageTagPitches(tx,"test-world",0),{newPitches:0});
 await assert.rejects(()=>publishBackstageTagPitches(tx,"",-1),/Invalid Backstage pitch week/);
});

test("tag pitches read only active human-owned certified shows and retain real evidence thresholds",async()=>{
 const tx:SqlRows={query:async(statement,params)=>{
  assert.deepEqual(params,["test-world",53,1,42,2,1]);
  assert.match(statement,/WITH human_promotions AS MATERIALIZED/);
  assert.match(statement,/SELECT DISTINCT owner\.promotion_id/);
  assert.match(statement,/member\.status='ACTIVE'/);
  assert.match(statement,/owner\.active/);
  assert.match(statement,/FROM human_promotions human/);
  assert.match(statement,/JOIN ppw_completed_shows sh ON sh\.world_id=\$1/);
  assert.match(statement,/\(sh\.year,sh\.week\) BETWEEN \(\$3::integer,\$4::integer\)/);
  assert.match(statement,/AND \(\$5::integer,\$6::integer\)/);
  assert.match(statement,/a\.week_index BETWEEN greatest\(0,\$2-12\) AND \$2-1/);
  assert.match(statement,/count\(DISTINCT a\.show_id\)>=2/);
  assert.match(statement,/avg\(a\.execution_quality\)>=68/);
  assert.match(statement,/avg\(played\.crowd_response\)>=70/);
  assert.match(statement,/rel\.professional_trust>=60/);
  assert.match(statement,/rel\.familiarity>=1/);
  assert.match(statement,/ON CONFLICT DO NOTHING/);
  return [];
 }};
 assert.deepEqual(await publishBackstageTagPitches(tx,"test-world",53),
  {newPitches:0});
});

test("tag pitch 12-week evidence stays correctly indexed through years 1, 2 and 3",async()=>{
 const cases:[number,[number,number,number,number]][]=[
  [1,[1,1,1,1]], [52,[1,41,1,52]],
  [53,[1,42,2,1]], [63,[1,52,2,11]],
  [104,[2,41,2,52]], [105,[2,42,3,1]],
  [156,[3,41,3,52]],
 ];
 for(const [week,window] of cases){
  let queries=0;
  const tx:SqlRows={query:async(_sql,params)=>{
   queries++;
   assert.deepEqual(params,["test-world",week,...window]);
   return [];
  }};
  assert.deepEqual(await publishBackstageTagPitches(tx,"test-world",week),
   {newPitches:0});
  assert.equal(queries,1);
 }
});
