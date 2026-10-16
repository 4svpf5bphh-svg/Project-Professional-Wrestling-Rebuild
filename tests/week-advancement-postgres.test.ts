import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {advanceResolvedWorldWeek} from "../src/db/week-advancement.js";

const url=process.env.PPW_NEON_TEST_URL;
test("week cannot advance until each active promotion is resolved and certified; 52-week rollover and retries",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="rollover-"+id;
  const promoA="a-"+id,promoB="b-"+id,showA="show-a-"+id,showB="show-b-"+id;
  const advance=(requestId:string,expectedRevision=0)=>advanceResolvedWorldWeek(db.pool,{worldId,requestId,expectedRevision});
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Rollover Fixture",seed:1,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promoA,name:"Promotion A",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:promoB,name:"Promotion B",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'arena-a','A'),($1,'arena-b','B')",[worldId]);
      // This fixture tests advancement, not certification production.
      await tx.query("INSERT INTO ppw_week_resource_clearances(world_id,year,week,eligible_promotions,inspected_slots,command_request_id) VALUES($1,1,52,2,2,'fixture-clear')",[worldId]);
      await tx.query(`UPDATE ppw_worlds SET phase='RESOLVING',year=1,week=52,day=7,
        next_lock_at=clock_timestamp()-interval '1 minute' WHERE world_id=$1`,[worldId]);
      await tx.query(
        "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,52,'SUBMITTED',1,'arena-a'),($1,$4,$5,1,52,'SUBMITTED',2,'arena-b')",
        [worldId,showA,promoA,showB,promoB],
      );
      await tx.query(
        "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'slot-a',0,'SEGMENT',$4::jsonb),($1,$3,'slot-b',0,'SEGMENT',$4::jsonb)",
        [worldId,showA,showB,JSON.stringify({participants:[]})],
      );
      await tx.query(
        `INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged)
         VALUES($1,$2,$3,51,$4,2,1)`,
        [worldId,showA,promoA,"resolution-a-"+id],
      );
    });
    await assert.rejects(advance("incomplete"),/active promotions need resolved shows/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      `INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged)
       VALUES($1,$2,$3,51,$4,2,1)`,
      [worldId,showB,promoB,"resolution-b-"+id],
    ));
    await assert.rejects(advance("no-seal"),/no valid resolution certification/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions) VALUES($1,1,52,1)",
      [worldId],
    ));
    await assert.rejects(advance("wrong-seal"),/no valid resolution certification/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_week_resolution_seals SET certified_promotions=2 WHERE world_id=$1",[worldId],
    ));
    await withWorldTransaction(db.pool,tx=>tx.query(
      "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES ($1,$2,$3,1,52,$4,70,'{}'::jsonb,repeat('a',64)),($1,$5,$6,1,52,$7,70,'{}'::jsonb,repeat('b',64))",
      [worldId,promoA,showA,"fixture-a-"+id,promoB,showB,"fixture-b-"+id],
    ));
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET show_day=1,venue_id='arena-a' WHERE world_id=$1 AND draft_id=$2",[worldId,showB],
    ));
    await assert.rejects(advance("stale-seal-conflict"),/unresolved schedule conflicts/);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET show_day=2,venue_id='arena-b' WHERE world_id=$1 AND draft_id=$2",[worldId,showB],
    ));
    const old=await withWorldTransaction(db.pool,tx=>tx.query<{next_lock_at:Date}>(
      "SELECT next_lock_at FROM ppw_worlds WHERE world_id=$1",[worldId],
    ));
    const request="finish-"+id;
    const competing="competing-"+id;
    const outcomes=await Promise.all([advance(request),advance(competing)]);
    assert.equal(outcomes.filter(r=>r.status==="APPLIED").length,1);
    assert.equal(outcomes.filter(r=>r.status==="STALE").length,1);
    const winner=outcomes[0]!.status==="APPLIED"?request:competing;
    const applied=outcomes.find(r=>r.status==="APPLIED")!;
    assert.deepEqual(applied.status==="APPLIED"?applied.result:null,{
      completedYear:1,completedWeek:52,nextYear:2,nextWeek:1,resolvedPromotions:2,
    });
    assert.equal((await advance(winner)).status,"REPLAYED");
    await assert.rejects(advance("extra",1),/World is not resolving/);
    const state=await withWorldTransaction(db.pool,tx=>tx.query<{
      year:number;week:number;day:number;phase:string;revision:string;
      next_lock_at:Date;
    }>("SELECT year,week,day,phase,revision,next_lock_at FROM ppw_worlds WHERE world_id=$1",[worldId]));
    assert.equal(state[0]!.year,2);
    assert.equal(state[0]!.week,1);
    assert.equal(state[0]!.day,1);
    assert.equal(state[0]!.phase,"OPEN");
    assert.equal(Number(state[0]!.revision),1);
    assert.equal(state[0]!.next_lock_at.getTime()-old[0]!.next_lock_at.getTime(),86400000);
    const ledger=await withWorldTransaction(db.pool,tx=>tx.query<{event_type:string;year:number;week:number}>(
      "SELECT event_type,year,week FROM ppw_ledger_events WHERE world_id=$1",[worldId],
    ));
    assert.deepEqual(ledger,[{event_type:"WORLD_WEEK_COMPLETED",year:1,week:52}]);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_ledger_events WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_resolution_seals WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_show_resolutions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});

test("overdue next deadline blocks reopening; prior data is retained",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),worldId="overdue-"+randomUUID(),promo="active";
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Overdue Fixture",seed:2,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promo,name:"Active",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'overdue-arena','Overdue')",[worldId]);
      await tx.query("INSERT INTO ppw_week_resource_clearances(world_id,year,week,eligible_promotions,inspected_slots,command_request_id) VALUES($1,1,1,1,1,'overdue-fixture-clear')",[worldId]);
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING',next_lock_at=clock_timestamp()-interval '2 days' WHERE world_id=$1",[worldId]);
      await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,'show-overdue',$2,1,1,'SUBMITTED',1,'overdue-arena')",[worldId,promo]);
      await tx.query("INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,'show-overdue','overdue-slot',0,'SEGMENT',$2::jsonb)",[worldId,JSON.stringify({participants:[]})]);
      await tx.query(
        `INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged)
         VALUES($1,'show-overdue',$2,0,'overdue-resolve',0,0)`,
        [worldId,promo],
      );
      await tx.query("INSERT INTO ppw_week_resolution_seals(world_id,year,week,certified_promotions) VALUES($1,1,1,1)",[worldId]);
      await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,'show-overdue',1,1,'fixture-overdue',70,'{}'::jsonb,repeat('c',64))",[worldId,promo]);
    });
    await assert.rejects(advanceResolvedWorldWeek(db.pool,{worldId,requestId:"overdue",expectedRevision:0}),/recovery required/);
    const state=await withWorldTransaction(db.pool,tx=>tx.query<{phase:string;revision:string;week:number}>(
      "SELECT phase,revision,week FROM ppw_worlds WHERE world_id=$1",[worldId],
    ));
    assert.equal(state[0]!.phase,"RESOLVING");
    assert.equal(Number(state[0]!.revision),0);
    assert.equal(state[0]!.week,1);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_ledger_events WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_resolution_seals WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_completed_shows WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_show_resolutions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
