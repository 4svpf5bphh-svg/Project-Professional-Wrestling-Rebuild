import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {startWorldUpdating,processWorldUpdate} from "../src/db/world-updating.js";
import {createWorld} from "../src/db/world-operations.js";

const url=process.env.PPW_NEON_TEST_URL;
test("World Updating: dark week publishes once, crosses year boundary, resumes without advancing again",{skip:!url},async()=>{
 const db=postgresPool(url!,2);
 const worldId="update-"+randomUUID();
 const scope={worldId,year:1,week:52};
 let calls=0;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Updating regression",seed:123,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET year=2,week=1,phase='OPEN' WHERE world_id=$1",[worldId]);
   await startWorldUpdating(tx,scope);
  });
  const deps={groqKey:"mock",publish:async()=>{calls++;throw Error("simulated provider failure");}};
  assert.equal((await processWorldUpdate(db.pool,{worldId,year:2,week:1},deps))?.status,"BLOCKED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"PUBLISHED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"PUBLISHED");
  assert.equal(calls,1);
  const rows=await withSqlClient(db.pool,tx=>tx.query("SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.deepEqual(rows,[{year:2,week:1,phase:"OPEN"}]);
 }finally{await db.close();}
});
