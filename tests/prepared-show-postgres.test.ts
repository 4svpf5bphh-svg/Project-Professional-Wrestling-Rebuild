import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {markPreparedShowReadyAsActor} from "../src/api/world-service.js";
import {markPreparedShowReady} from "../src/db/ready-prepared-show.js";
import {lockWorldWeek} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";

const url=process.env.PPW_NEON_TEST_URL;
test("valid saved and confirmed cards submit at World Lock; changed and empty drafts remain untouched",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,4),id=randomUUID(),worldId="prepared-"+id;
  const promoters=Array.from({length:5},(_,i)=>"promo-"+i+"-"+id);
  const players=Array.from({length:5},(_,i)=>"player-"+i+"-"+id);
  const drafts=Array.from({length:5},(_,i)=>"draft-"+i+"-"+id);
  const ready=(idx:number,requestId:string,expectedRevision:number)=>
    markPreparedShowReadyAsActor({pool:db.pool,actor:{playerId:players[idx]!}},{
      worldId,promotionId:promoters[idx]!,showId:drafts[idx]!,
      requestId,expectedRevision,confirmReadyToRun:true,
    });
  try{
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Prepared Shows",seed:44,rulesetVersion:"test"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'main','Main')",[worldId]);
      for(let i=0;i<5;i++){
        await addPromotion(tx,worldId,{id:promoters[i]!,name:"Promotion "+i,tier:"LOCAL"});
        await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[players[i]!]);
        await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
          [worldId,players[i]!]);
        await tx.query(
          "INSERT INTO ppw_promotion_controls(world_id,promotion_id,player_id) VALUES($1,$2,$3)",
          [worldId,promoters[i]!,players[i]!],
        );
        await tx.query(
          `INSERT INTO ppw_booking_drafts
           (world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
           VALUES($1,$2,$3,1,1,$4,3,'main')`,
          [worldId,drafts[i]!,promoters[i]!,i===3?"SUBMITTED":"DRAFT"],
        );
        if(i!==4)await tx.query(
          `INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
           VALUES($1,$2,$3,0,'SEGMENT',$4::jsonb)`,
          [worldId,drafts[i]!,"slot-"+i,JSON.stringify({
            participants:[],scriptedOutcome:"player choice "+i,
          })],
        );
      }
    });
    await assert.rejects(ready(4,"empty",0),/CARD_SIZE/);
    await assert.rejects(markPreparedShowReady(db.pool,{
      worldId,playerId:players[0]!,promotionId:promoters[1]!,
      showId:drafts[1]!,requestId:"spoof",expectedRevision:0,confirmReadyToRun:true,
    }),/not an editable draft/);
    const first=await ready(0,"mark-0",0);
    assert.equal(first.status,"APPLIED");
    assert.equal(first.result.preparedForLock,true);
    assert.equal((await ready(0,"mark-0",0)).status,"REPLAYED");
    const second=await ready(1,"mark-1",1);
    assert.equal(second.status,"APPLIED");
    assert.notEqual(first.result.fingerprint,second.result.fingerprint);
    // A scripted change after player confirmation must invalidate the marker.
    await withWorldTransaction(db.pool,tx=>tx.query(
      `UPDATE ppw_card_slots SET payload=jsonb_set(payload,'{scriptedOutcome}','"modified"')
        WHERE world_id=$1 AND draft_id=$2`,[worldId,drafts[1]!],
    ));
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
      [worldId],
    ));
    await assert.rejects(ready(2,"late",2),/booking deadline passed/);
    assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:2})).status,"APPLIED");
    assert.equal((await recordWeekContinuity(db.pool,{
      worldId,requestId:"continuity",expectedRevision:3,
    })).status,"APPLIED");
    const input={worldId,requestId:"finalize",expectedRevision:4};
    const result=await finalizePreparedWorldShows(db.pool,input);
    assert.equal(result.status,"APPLIED");
    assert.deepEqual(result.result.submittedShowIds,[drafts[0],drafts[2]]);
    assert.deepEqual(result.result.review,[{showId:drafts[1],reason:"DRAFT_CHANGED"}]);
    assert.equal((await finalizePreparedWorldShows(db.pool,input)).status,"REPLAYED");
    await assert.rejects(finalizePreparedWorldShows(db.pool,{
      worldId,requestId:"again",expectedRevision:5,
    }),/already completed/);
    const statuses=await withWorldTransaction(db.pool,tx=>tx.query<{draft_id:string;status:string}>(
      "SELECT draft_id,status FROM ppw_booking_drafts WHERE world_id=$1 ORDER BY draft_id",[worldId],
    ));
    assert.deepEqual(statuses.map(s=>s.status),[
      "SUBMITTED","DRAFT","SUBMITTED","SUBMITTED","DRAFT",
    ]);
    const unchanged=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{scriptedOutcome:string}}>(
      "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2",[worldId,drafts[0]!],
    ));
    assert.equal(unchanged[0]!.payload.scriptedOutcome,"player choice 0");
    const finalizations=await withWorldTransaction(db.pool,tx=>tx.query<{
      submitted_count:number;review_count:number}>(
      "SELECT submitted_count,review_count FROM ppw_week_prepared_finalizations WHERE world_id=$1",
      [worldId],
    ));
    assert.deepEqual(finalizations,[{submitted_count:2,review_count:1}]);
    const results=await withWorldTransaction(db.pool,tx=>tx.query<{count:string}>(
      "SELECT count(*)::text AS count FROM ppw_show_resolutions WHERE world_id=$1",[worldId],
    ));
    assert.equal(results[0]!.count,"0");
  }finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_ledger_events WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_prepared_finalizations WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_continuity_assessments WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      for(const player of players)await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
