import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";

const url=process.env.PPW_NEON_TEST_URL;
test("one-day talent and venue collisions block provisional readiness; different days are allowed",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="conflicts-"+id;
  const a="a-"+id,b="b-"+id,c="c-"+id,sa="show-a-"+id,sb="show-b-"+id,wrestler="shared-"+id;
  const inspect=()=>withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Conflict Fixture",seed:7,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:a,name:"Promotion A",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:b,name:"Promotion B",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:c,name:"Promotion C",tier:"LOCAL"});
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
      await tx.query(
        "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,1,'SUBMITTED',3,'arena'),($1,$4,$5,1,1,'SUBMITTED',3,'arena')",
        [worldId,sa,a,sb,b],
      );
      await tx.query(
        "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'slot-a',0,'MATCH',$4::jsonb),($1,$3,'slot-b',0,'MATCH',$4::jsonb)",
        [worldId,sa,sb,JSON.stringify({participants:[{personId:wrestler,contractId:"fictional-contract"}]})],
      );
    });
    let result=await inspect();
    assert.equal(result.submittedShows,2);
    assert.deepEqual(result.blockers.map(x=>x.code).sort(),["MISSING_SHOW","VENUE_DAY_CONFLICT","WRESTLER_DAY_CONFLICT"]);
    assert.equal(result.provisionalClear,false);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET show_day=4,venue_id='different-arena' WHERE world_id=$1 AND draft_id=$2",[worldId,sb],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["MISSING_SHOW"]);
    // Weekly non-exclusive scheduling across DIFFERENT show days is permitted.
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query(
        "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,'show-c',$2,1,1,'SUBMITTED',5,'third-arena')",
        [worldId,c],
      );
      await tx.query(
        "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,'show-c','slot-c',0,'MATCH',$2::jsonb)",
        [worldId,JSON.stringify({participants:[{personId:"third",contractId:"third-contract"}]})],
      );
    });
    result=await inspect();
    assert.deepEqual(result.blockers,[]);
    assert.equal(result.provisionalClear,true);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET venue_id=NULL WHERE world_id=$1 AND draft_id=$2",[worldId,sb],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["MISSING_SCHEDULE"]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET venue_id='different-arena' WHERE world_id=$1 AND draft_id=$2",[worldId,sb],
    ));
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_card_slots SET payload='{}'::jsonb WHERE world_id=$1 AND draft_id=$2",[worldId,sb],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["INVALID_CARD"]);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
