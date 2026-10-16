import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {recordCompletedShow} from "../src/db/completed-show-results.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;
test("completed show is atomic, retry-safe and conflict-safe in PostgreSQL",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),suffix=randomUUID();
 const worldId="results-"+suffix,promotionId="p-"+suffix,showId="s-"+suffix;
 const receipt:CompletedShowReceipt={worldId,promotionId,showId,year:1,week:1,
  resolutionId:"resolve-"+suffix,crowdResponse:75,
  matches:[{matchId:"match",position:0,crowdResponse:80,
   actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],
  segments:[{slotId:"angle",position:1,kind:"TURN",
   outcome:"REFUSED",crowdResponse:67}]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Results Ledger",seed:5,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Test",tier:"LOCAL"});
   await tx.query(
    `INSERT INTO ppw_booking_drafts
      (world_id,draft_id,promotion_id,year,week,status,show_day)
      VALUES($1,$2,$3,1,1,'SUBMITTED',3)`,
    [worldId,showId,promotionId]);
   await tx.query(
    `INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,'match',0,'MATCH','{}'::jsonb),
           ($1,$2,'angle',1,'SEGMENT','{}'::jsonb)`,
    [worldId,showId]);
   await tx.query(
    "UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
  });
  for(const invalid of [
   {...receipt,matches:[{...receipt.matches[0]!,matchId:"invented"}]},
   {...receipt,matches:[]},
   {...receipt,segments:[]},
   {...receipt,segments:[{...receipt.segments[0]!,position:2}]},
   {...receipt,matches:[{...receipt.matches[0]!,position:1}],
    segments:[{...receipt.segments[0]!,position:0}]},
  ]){
   await assert.rejects(recordCompletedShow(db.pool,invalid),
    /does not match submitted card/);
   const rows=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
    "SELECT count(*)::text AS n FROM ppw_completed_shows WHERE world_id=$1",
    [worldId]));
   assert.equal(rows[0]!.n,"0","Invalid receipt must leave no completed show");
  }
  const first=await Promise.all([
   recordCompletedShow(db.pool,receipt),
   recordCompletedShow(db.pool,receipt)]);
  assert.deepEqual(first.sort(),["IDENTICAL_RETRY","RECORDED"]);
  await assert.rejects(recordCompletedShow(db.pool,{
   ...receipt,crowdResponse:72}),/Conflicting/);
  const count=await withWorldTransaction(db.pool,async tx=>tx.query<{
   shows:string;matches:string;segments:string}>(
    `SELECT (SELECT count(*) FROM ppw_completed_shows WHERE world_id=$1)::text AS shows,
      (SELECT count(*) FROM ppw_completed_show_matches WHERE world_id=$1)::text AS matches,
      (SELECT count(*) FROM ppw_completed_show_segments WHERE world_id=$1)::text AS segments`,
    [worldId]));
  assert.deepEqual(count[0],{shows:"1",matches:"1",segments:"1"});
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET phase='OPEN' WHERE world_id=$1",[worldId]));
  await assert.rejects(recordCompletedShow(db.pool,receipt),/not resolving/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_completed_show_segments WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_completed_show_matches WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_card_slots WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
