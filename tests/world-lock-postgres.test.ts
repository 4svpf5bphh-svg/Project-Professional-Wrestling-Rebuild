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

test("server cutoff blocks a booking write even if scheduler is delayed",{skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),worldId="cutoff-"+randomUUID(),promotionId="promo-"+randomUUID();
  const {applyWorldCommand}=await import("../src/db/world-commands.js");
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Cutoff Test",seed:1,rulesetVersion:"test"});
      await tx.query("INSERT INTO ppw_promotions(world_id,promotion_id,name,tier) VALUES($1,$2,'Fixture','LOCAL')",[worldId,promotionId]);
    });
    const save=(requestId:string,expectedRevision:number,draftId:string)=>({
      worldId,playerId:"test-player",requestId,expectedRevision,
      commandType:"TEST_SAVE_DRAFT",requiresOpenWeek:true,
      async execute(tx:import("../src/db/world-operations.js").SqlRows){
        await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week) VALUES($1,$2,$3,1,1)",[worldId,draftId,promotionId]);
        return {draftId};
      },
    });
    const first=save("save-first",0,"draft-early");
    assert.equal((await applyWorldCommand(db.pool,first)).status,"APPLIED");
    await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",[worldId]));
    assert.equal((await applyWorldCommand(db.pool,first)).status,"REPLAYED");
    await assert.rejects(applyWorldCommand(db.pool,save("save-late",1,"draft-late")) ,/World booking deadline passed/);
    const rows=await withWorldTransaction(db.pool,tx=>tx.query<{draft_id:string}>("SELECT draft_id FROM ppw_booking_drafts WHERE world_id=$1",[worldId]));
    assert.deepEqual(rows.map(row=>row.draft_id),["draft-early"]);
    const state=await withWorldTransaction(db.pool,tx=>tx.query<{phase:string;revision:string}>("SELECT phase,revision FROM ppw_worlds WHERE world_id=$1",[worldId]));
    assert.equal(state[0]!.phase,"OPEN");
    assert.equal(Number(state[0]!.revision),1);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});

test("manual preview lock cannot expire an open World on stale revisions",{
 skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,3),worldId="manual-lock-"+randomUUID();
 try{
  await withWorldTransaction(db.pool,tx=>createWorld(tx,{id:worldId,name:"Manual Preview",seed:20,rulesetVersion:"test"}));
  const state=async()=>withWorldTransaction(db.pool,tx=>tx.query<{
   revision:string;phase:string;open:boolean}>(
   "SELECT revision,phase,(next_lock_at>clock_timestamp()) AS open FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.equal((await state())[0]!.open,true);
  const stale=await lockWorldWeek(db.pool,{worldId,requestId:"stale-button",expectedRevision:99,manualPreview:true});
  assert.equal(stale.status,"STALE");
  assert.equal((await state())[0]!.phase,"OPEN");
  assert.equal((await state())[0]!.open,true);
  const locked=await lockWorldWeek(db.pool,{worldId,requestId:"manual-button",expectedRevision:0,manualPreview:true});
  assert.equal(locked.status,"APPLIED");
  assert.equal((await state())[0]!.phase,"LOCKED");
  assert.equal((await state())[0]!.open,false);
  assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"manual-button",expectedRevision:0,manualPreview:true})).status,"REPLAYED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
