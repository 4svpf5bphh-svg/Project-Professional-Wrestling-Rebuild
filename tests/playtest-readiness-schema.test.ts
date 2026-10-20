import test from "node:test";
import assert from "node:assert/strict";
import {inspectPlaytestPopulation} from "../src/db/playtest-preview-readiness.js";
import type {TransactionPool,TransactionConnection} from "../src/db/transaction.js";

test("incomplete legacy schema refuses playtest before expensive population query",async()=>{
 const statements:string[]=[];
 const connection={
  async query<T>(sql:string):Promise<T[]>{
   statements.push(sql);
   if(sql.includes("to_regclass"))return [{
    standings:false,affiliations:false,parent_column:false
   }] as T[];
   return [] as T[];
  },
  release(){}
 } as TransactionConnection;
 const pool:TransactionPool={async connect(){return connection;}};
 await assert.rejects(
  ()=>inspectPlaytestPopulation(pool,"world-20261017"),
  /schema is outdated.*0080/
 );
 assert.equal(statements.filter(s=>s.includes("SELECT")).length,1);
 assert.ok(statements.some(s=>s==="ROLLBACK"));
 assert.ok(!statements.some(s=>s.includes("FROM ppw_worlds w")));
});
test("invalid World identity is rejected before touching the pool",async()=>{
 const pool:TransactionPool={async connect(){throw Error("must not connect");}};
 await assert.rejects(()=>inspectPlaytestPopulation(pool,""),/Invalid World scope/);
});
