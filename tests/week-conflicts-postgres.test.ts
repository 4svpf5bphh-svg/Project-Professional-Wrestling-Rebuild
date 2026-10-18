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
  const contractA="contract-a-"+id,contractB="contract-b-"+id;
  const inspect=()=>withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Conflict Fixture",seed:7,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:a,name:"Promotion A",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:b,name:"Promotion B",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:c,name:"Promotion C",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'arena','Arena'),($1,'different-arena','Second'),($1,'third-arena','Third')",[worldId]);
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'Shared'),($1,'third','Third')",[worldId,wrestler]);
      await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
        VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20),
              ($1,$5,$3,$6,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20),
              ($1,'third-contract','third',$7,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20)`,
        [worldId,contractA,wrestler,a,contractB,b,c]);
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
      await tx.query(
        "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,1,'SUBMITTED',3,'arena'),($1,$4,$5,1,1,'SUBMITTED',3,'arena')",
        [worldId,sa,a,sb,b],
      );
      await tx.query(
        "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'slot-a',0,'MATCH',$4::jsonb),($1,$3,'slot-b',0,'MATCH',$5::jsonb)",
        [worldId,sa,sb,JSON.stringify({participants:[{personId:wrestler,contractId:contractA}]}),
          JSON.stringify({participants:[{personId:wrestler,contractId:contractB}]})],
      );
    });
    let result=await inspect();
    assert.equal(result.submittedShows,2);
    assert.deepEqual(result.blockers.map(x=>x.code).sort(),["MISSING_SHOW","VENUE_DAY_CONFLICT","WRESTLER_DAY_CONFLICT"]);
    assert.equal(result.provisionalClear,false);
    // Even when not competing, a run-in wrestler is booked for that day.
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
       VALUES($1,'third-a-contract','third',$2,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20)`,[worldId,a]);
      await tx.query("UPDATE ppw_card_slots SET payload=$3::jsonb WHERE world_id=$1 AND draft_id=$2",
       [worldId,sa,JSON.stringify({participants:[{personId:"third",contractId:"third-a-contract"}],
        interference:{personId:wrestler,contractId:contractA,aidedSide:"A",plannedOutcome:"SUCCESS"}})]);
      await tx.query("UPDATE ppw_booking_drafts SET venue_id='different-arena' WHERE world_id=$1 AND draft_id=$2",[worldId,sb]);
    });
    result=await inspect();
    assert.ok(result.blockers.some(x=>x.code==="WRESTLER_DAY_CONFLICT"&&x.resourceId===wrestler));
    assert.ok(!result.blockers.some(x=>x.code==="VENUE_DAY_CONFLICT"));
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("UPDATE ppw_card_slots SET payload=$3::jsonb WHERE world_id=$1 AND draft_id=$2",
       [worldId,sa,JSON.stringify({participants:[{personId:wrestler,contractId:contractA}]})]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1 AND contract_id='third-a-contract'",[worldId]);
    });
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
    // A missing or closed venue must fail; provisional text is not a booking.
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_venues SET status='INACTIVE' WHERE world_id=$1 AND venue_id='different-arena'",[worldId],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["VENUE_UNAVAILABLE"]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_venues SET status='ACTIVE' WHERE world_id=$1 AND venue_id='different-arena'",[worldId],
    ));
    // Two different days are legal if capacity allows both, but not if cap=1.
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET weekly_service_capacity=1 WHERE world_id=$1 AND person_id=$2",[worldId,wrestler],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["WRESTLER_WEEK_CAPACITY"]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_people SET weekly_service_capacity=2 WHERE world_id=$1 AND person_id=$2",[worldId,wrestler],
    ));
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_contracts SET status='TERMINATED' WHERE world_id=$1 AND contract_id=$2",[worldId,contractB],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["CONTRACT_UNAVAILABLE"]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_contracts SET status='SIGNED' WHERE world_id=$1 AND contract_id=$2",[worldId,contractB],
    ));
    // Cross-promotion exclusive rights cannot be bypassed by a second signed
    // nonexclusive deal in an inconsistent imported fixture.
    await withWorldTransaction(db.pool,tx=>tx.query(
      `INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
       VALUES($1,'exclusive-conflict',$2,$3,'EXCLUSIVE','SIGNED',NULL,20)`,
      [worldId,wrestler,c],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code).sort(),["CONTRACT_UNAVAILABLE","CONTRACT_UNAVAILABLE"]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "DELETE FROM ppw_contracts WHERE world_id=$1 AND contract_id='exclusive-conflict'",[worldId],
    ));
    // A legitimately consumed final date is no longer available for NEW shows,
    // but week completion must accept the already resolved appearance.
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("UPDATE ppw_contracts SET remaining_dates=0 WHERE world_id=$1 AND contract_id=$2",[worldId,contractA]);
      await tx.query(
        "INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,resolved_week_index,command_request_id,performers_count,dates_charged) VALUES($1,$2,$3,0,$4,1,1)",
        [worldId,sa,a,"resolved-"+id],
      );
    });
    result=await inspect();
    assert.deepEqual(result.blockers,[]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "DELETE FROM ppw_show_resolutions WHERE world_id=$1 AND show_id=$2",[worldId,sa],
    ));
    result=await inspect();
    assert.deepEqual(result.blockers.map(x=>x.code),["CONTRACT_UNAVAILABLE"]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_contracts SET remaining_dates=2 WHERE world_id=$1 AND contract_id=$2",[worldId,contractA],
    ));
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
      await tx.query("DELETE FROM ppw_show_resolutions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
