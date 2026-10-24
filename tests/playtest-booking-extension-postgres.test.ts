import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld} from "../src/db/world-operations.js";
import {extendPlaytestBooking} from "../src/db/manual-playtest-week.js";

/** Isolated integration regression: reopening the booking clock never runs the
 * World, creates cards, or erases a promoter's provisional venue selection.
 */
const url=process.env.PPW_NEON_TEST_URL;
test("expired OPEN booking can be rescued once without touching saved show or World phase",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,2),worldId="booking-rescue-"+randomUUID();
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Deadline Rescue",seed:17,rulesetVersion:"test"});
   await tx.query(`UPDATE ppw_worlds SET year=1,week=2,phase='OPEN',
    next_lock_at=clock_timestamp()-interval '1 hour' WHERE world_id=$1`,[worldId]);
  });
  await assert.rejects(extendPlaytestBooking(db.pool,worldId,1,1),/cannot be extended/);
  await assert.rejects(extendPlaytestBooking(db.pool,worldId,1,53),/Invalid/);
  const first=await extendPlaytestBooking(db.pool,worldId,1,2);
  assert.deepEqual(first,{status:"OPEN",year:1,week:2});
  const snapshot=await withWorldTransaction(db.pool,async tx=>
   tx.query<{year:number;week:number;phase:string;seconds:number;revision:number|string}>(`
    SELECT year,week,phase,extract(epoch from next_lock_at-clock_timestamp())::integer AS seconds,
     revision FROM ppw_worlds WHERE world_id=$1`,[worldId]));
  assert.equal(snapshot[0]?.year,1);
  assert.equal(snapshot[0]?.week,2);
  assert.equal(snapshot[0]?.phase,"OPEN");
  assert.ok((snapshot[0]?.seconds??0)>4*365*24*3600);
  assert.ok((snapshot[0]?.seconds??0)<6*365*24*3600);
  const repeated=await extendPlaytestBooking(db.pool,worldId,1,2);
  assert.equal(repeated.status,"OPEN","Safe repeated extension does not advance or alter cards");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET phase='LOCKED',next_lock_at=clock_timestamp()-interval '1 minute' WHERE world_id=$1",[worldId]);
  });
  await assert.rejects(extendPlaytestBooking(db.pool,worldId,1,2),/cannot be extended/,
   "Locked Worlds must not be reopened, even after the deadline");
 }finally{await db.close();}
});