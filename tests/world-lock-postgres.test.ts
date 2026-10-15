import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld} from "../src/db/world-operations.js";
import {lockWorldWeek,beginWorldResolution} from "../src/db/world-lock.js";

const url=process.env.PPW_NEON_TEST_URL;
test("one weekly deadline: early denial, concurrent lock, retry, internal resolution",{skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),worldId="one-lock-"+randomUUID();
  try {
    await withWorldTransaction(db.pool,tx=>createWorld(tx,{id:worldId,name:"One Lock",seed:1,rulesetVersion:"test"}));
    const a={worldId,requestId:"lock-a",expectedRevision:0};
    await assert.rejects(lockWorldWeek(db.pool,a),/deadline not reached/);
    await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET next_lock_at=now()-interval '1 second' WHERE world_id=$1",[worldId]));
    const b={worldId,requestId:"lock-b",expectedRevision:0};
    const races=await Promise.all([lockWorldWeek(db.pool,a),lockWorldWeek(db.pool,b)]);
    assert.equal(races.filter(r=>r.status==="APPLIED").length,1);
    assert.equal(races.filter(r=>r.status==="STALE").length,1);
    assert.equal((await lockWorldWeek(db.pool,races[0]!.status==="APPLIED"?a:b)).status,"REPLAYED");
    await assert.rejects(lockWorldWeek(db.pool,{...a,requestId:"extra",expectedRevision:1}),/World is not open/);
    const begin={worldId,requestId:"begin",expectedRevision:1};
    const result=await beginWorldResolution(db.pool,begin);
    assert.equal(result.status,"APPLIED");
    assert.deepEqual(result.result,{year:1,week:1,weekIndex:0});
    assert.equal((await beginWorldResolution(db.pool,begin)).status,"REPLAYED");
    const rows=await withWorldTransaction(db.pool,tx=>tx.query<{revision:string;phase:string}>("SELECT revision,phase FROM ppw_worlds WHERE world_id=$1",[worldId]));
    assert.equal(Number(rows[0]!.revision),2);
    assert.equal(rows[0]!.phase,"RESOLVING");
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
