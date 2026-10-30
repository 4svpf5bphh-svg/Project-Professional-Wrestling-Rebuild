import test from "node:test";
import assert from "node:assert/strict";
import type {SqlRows} from "../src/db/world-operations.js";
import {publishBackstageRequests} from "../src/db/backstage-conversations.js";

test("Backstage inbox scans only a manager's history, with indexed windows across years",async()=>{
 const windows:[number,number[]][]=[
  [0,[1,1,0,52,1,1]],
  [1,[1,1,1,1,1,1]],
  [52,[1,41,1,52,1,45]],
  [53,[1,42,2,1,1,46]],
  [105,[2,42,3,1,2,46]],
  [156,[3,41,3,52,3,45]],
 ];
 for(const [week,range] of windows){
  const statements:string[]=[];
  const tx:SqlRows={query:async(sql,params)=>{
   statements.push(sql);
   assert.deepEqual(params,["human-world",week,...range]);
   return [];
  }};
  assert.deepEqual(await publishBackstageRequests(tx,"human-world",week),
   {newMessages:0});
  assert.equal(statements.length,1,"No extra Neon roundtrips for scoped inbox evidence");
  const sql=statements[0]!;
  assert.match(sql,/WITH human_promotions AS MATERIALIZED/);
  assert.match(sql,/SELECT DISTINCT owner\.promotion_id/);
  assert.match(sql,/member\.status='ACTIVE'/);
  assert.match(sql,/owner\.active/);
  assert.equal((sql.match(/(?:FROM|JOIN) human_promotions human/g)??[]).length,5,
   "Show, tag strain, two career sources and recent shows must all be human scoped");
  assert.match(sql,/\(sh\.year,sh\.week\) BETWEEN \(\$3::integer,\$4::integer\)/);
  assert.match(sql,/\(\$7::integer,\$8::integer\)/);
  assert.doesNotMatch(sql,/\(sh\.year-1\)\*52/);
  assert.match(sql,/ON CONFLICT DO NOTHING RETURNING request_id/);
 }
 await assert.rejects(
  publishBackstageRequests({query:async()=>[]},"",-1),
  /Invalid Backstage request week/);
});
