import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction } from "../src/db/transaction.js";
import { createWorld,addPromotion } from "../src/db/world-operations.js";
import { consumeShowAppearances } from "../src/db/appearance-consumption.js";
import { beginWorldResolution } from "../src/db/world-lock.js";

const url=process.env.PPW_NEON_TEST_URL;
test("show date charges are atomic and idempotent, including failed mixed cards",{skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="dates-"+id;
  const promotionId="promotion-"+id,p1="finite-"+id,p2="unlimited-"+id,c1="contract-f-"+id,c2="contract-u-"+id;
  const read=async()=>withWorldTransaction(db.pool,async tx=>{
    const r=await tx.query<{remaining_dates:number|null}>("SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 AND contract_id=$2",[worldId,c1]);
    return r[0]!.remaining_dates;
  });
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Date Fixture",seed:4,rulesetVersion:"test"});
      await tx.query("UPDATE ppw_worlds SET week=11 WHERE world_id=$1",[worldId]);
      await addPromotion(tx,worldId,{id:promotionId,name:"Date Promotion",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status) VALUES($1,$2,$3,1,11,'SUBMITTED'),($1,$4,$3,1,12,'SUBMITTED')",[worldId,"show-"+id,promotionId,"bad-show-"+id]);
      await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,$3,0,'MATCH',$4::jsonb),($1,$5,$6,0,'MATCH',$7::jsonb)",[worldId,"show-"+id,"slot-"+id,JSON.stringify({participants:[{personId:p1,contractId:c1},{personId:p1,contractId:c1},{personId:p2,contractId:c2}]}),"bad-show-"+id,"bad-slot-"+id,JSON.stringify({participants:[{personId:p1,contractId:c1},{personId:"missing",contractId:"missing"}]})]);
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Finite'),($1,$3,'Unlimited')",[worldId,p1,p2]);
      await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20),($1,$5,$6,$4,'EXCLUSIVE','SIGNED',NULL,20)",[worldId,c1,p1,promotionId,c2,p2]);
    });
    const baseInput={worldId,playerId:"system",promotionId,showId:"show-"+id,requestId:"resolve-"+id};
    await assert.rejects(consumeShowAppearances(db.pool,{...baseInput,expectedRevision:0}),/World is not resolving/);
    assert.equal(await read(),2);
    const start={worldId,requestId:"begin-"+id,expectedRevision:0};
    await assert.rejects(beginWorldResolution(db.pool,start),/World must be locked/);
    await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET phase='LOCKED' WHERE world_id=$1",[worldId]));
    const begun=await beginWorldResolution(db.pool,start);
    assert.equal(begun.status,"APPLIED");
    assert.deepEqual(begun.result,{year:1,week:11,weekIndex:10});
    assert.equal((await beginWorldResolution(db.pool,start)).status,"REPLAYED");
    await assert.rejects(beginWorldResolution(db.pool,{...start,requestId:"second-begin-"+id,expectedRevision:1}),/World must be locked/);
    const input={...baseInput,expectedRevision:1};
    const result=await consumeShowAppearances(db.pool,input);
    assert.equal(result.status,"APPLIED");
    assert.deepEqual(result.result,{performers:2,datesCharged:1});
    assert.equal(await read(),1);
    assert.equal((await consumeShowAppearances(db.pool,input)).status,"REPLAYED");
    assert.equal(await read(),1);
    await assert.rejects(consumeShowAppearances(db.pool,{...input,requestId:"duplicate-show-"+id,expectedRevision:2}),/Show already resolved/);
    assert.equal(await read(),1);
    await assert.rejects(consumeShowAppearances(db.pool,{...input,showId:"bad-show-"+id,requestId:"wrong-week-"+id,expectedRevision:2}),/World week/);
    await withWorldTransaction(db.pool,tx=>tx.query("UPDATE ppw_worlds SET week=12 WHERE world_id=$1",[worldId]));
    await assert.rejects(consumeShowAppearances(db.pool,{...input,showId:"bad-show-"+id,requestId:"bad-"+id,expectedRevision:2}),/Contract unavailable/);
    assert.equal(await read(),1);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_show_resolutions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
