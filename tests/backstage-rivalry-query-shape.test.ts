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
  assert.deepEqual(params,["genesis",15]);
  return [];
 }};
 assert.deepEqual(await publishBackstageRivalryPitches(rows,"genesis",15),
  {newPitches:0});
 assert.equal(sql.length,1,"The ordinary rival-pitch path remains one bounded query");
 const command=sql[0]!;
 assert.match(command,/WITH completed AS MATERIALIZED/);
 assert.match(command,/EXISTS\(SELECT 1 FROM ppw_promotion_controls owner/);
 assert.match(command,/member\.status='ACTIVE'/);
 assert.match(command,/played\.world_id=sh\.world_id/);
 assert.match(command,/count\(DISTINCT c\.show_id\)>=2/);
 assert.match(command,/ON CONFLICT DO NOTHING/);
});
