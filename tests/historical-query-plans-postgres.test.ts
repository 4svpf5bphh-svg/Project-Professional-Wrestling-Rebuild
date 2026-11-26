import assert from "node:assert/strict";
import test from "node:test";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {weekDateRangeSql} from "../src/db/week-date-sql.js";

const url=process.env.PPW_NEON_TEST_URL;

type Plan={
 "Node Type":string;"Relation Name"?:string;"Actual Rows":number;"Actual Loops":number;
 "Rows Removed by Filter"?:number;"Index Cond"?:string;Plans?:Plan[];
};
function nodes(plan:Plan):Plan[]{
 return [plan,...(plan.Plans??[]).flatMap(nodes)];
}

test("a century of results and drafts uses bounded indexed weeks across rollover",{
 skip:!url?"Disposable PostgreSQL required":false,
},async()=>{
 const db=postgresPool(url!,1);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   // Copy the real index definitions, using a session-local synthetic World.
   await tx.query("CREATE TEMP TABLE aged_results (LIKE ppw_completed_shows INCLUDING ALL) ON COMMIT DROP",[]);
   await tx.query("CREATE TEMP TABLE aged_drafts (LIKE ppw_booking_drafts INCLUDING ALL) ON COMMIT DROP",[]);
   await tx.query(`INSERT INTO aged_results(world_id,promotion_id,show_id,year,week,resolution_id,
    crowd_response,receipt_json,receipt_digest)
    SELECT 'aged',p::text,p||'-'||i,i/52+1,i%52+1,'result-'||i,70,'{}',repeat('a',64)
    FROM generate_series(0,5199) i CROSS JOIN generate_series(1,8) p`,[]);
   await tx.query(`INSERT INTO aged_drafts(world_id,promotion_id,draft_id,year,week,status)
    SELECT 'aged',p::text,p||'-'||i,i/52+1,i%52+1,'DRAFT'
    FROM generate_series(0,5207) i CROSS JOIN generate_series(1,8) p`,[]);
   await tx.query("ANALYZE aged_results",[]);
   await tx.query("ANALYZE aged_drafts",[]);
   for(const [table,id,first,last] of [
    ["aged_results","show_id",5194,5205],["aged_drafts","draft_id",5199,5205]
   ] as const){
    const select=`SELECT h.${id},h.year,h.week FROM ${table} h WHERE h.world_id=$1 AND h.promotion_id=$2 AND `;
    const end=` ORDER BY h.year DESC,h.week DESC,h.${id} DESC LIMIT 30`;
    const old=select+"(h.year-1)*52+h.week-1 BETWEEN $3 AND $4"+end;
    const indexed=select+weekDateRangeSql("h","$3","$4")+end;
    const params=["aged","1",first,last];
    const original=await tx.query(old,params);
    const current=await tx.query(indexed,params);
    assert.deepEqual(current,original);
    assert.equal(current.length,table==="aged_results"?6:7);
    if(table==="aged_drafts"){
     assert.deepEqual(current[0],{draft_id:"1-5205",year:101,week:6});
     assert.deepEqual(current.at(-1),{draft_id:"1-5199",year:100,week:52});
    }
    const benchmark=async(sql:string)=>{
     const elapsed:number[]=[];
     let scan:Plan[]=[];
     for(let run=0;run<5;run++){
      const [row]=await tx.query<{"QUERY PLAN":{Plan:Plan;"Execution Time":number}[]}>(
       "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) "+sql,params);
      const plan=row!["QUERY PLAN"][0]!;
      scan=nodes(plan.Plan).filter(node=>node["Relation Name"]===table);
      elapsed.push(plan["Execution Time"]);
     }
     return {
      nodes:scan.map(node=>node["Node Type"]),
      rowsVisited:scan.reduce((n,node)=>n+node["Actual Loops"]*
       (node["Actual Rows"]+(node["Rows Removed by Filter"]??0)),0),
      executionMs:elapsed.sort((a,b)=>a-b)[2],
      dateIndexed:scan.some(node=>node["Index Cond"]?.includes("ROW(year, week)")),
     };
    };
    const before=await benchmark(old),after=await benchmark(indexed);
    assert.ok(before.rowsVisited>=5200);
    assert.ok(after.rowsVisited<=7);
    assert.equal(after.dateIndexed,true);
    console.log("PPW aged query plan "+JSON.stringify({table,before,after,resultRows:current.length,
     resultBytes:Buffer.byteLength(JSON.stringify(current))}));
   }
  });
 }finally{await db.close();}
});
