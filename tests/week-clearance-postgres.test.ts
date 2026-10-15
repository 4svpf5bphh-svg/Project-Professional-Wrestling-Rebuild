import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {clearWorldWeekResources} from "../src/db/week-clearance.js";
import {consumeShowAppearances} from "../src/db/appearance-consumption.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";

const url=process.env.PPW_NEON_TEST_URL;
test("pre-resolution clearance blocks all dates on conflicts, then allows only approved week",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),suffix=randomUUID();
  const worldId="clearance-"+suffix,personId="shared-"+suffix;
  const promoA="a-"+suffix,promoB="b-"+suffix;
  const showA="show-a-"+suffix,showB="show-b-"+suffix;
  const contractA="ca-"+suffix,contractB="cb-"+suffix;
  const clear=(requestId:string,expectedRevision:number)=>clearWorldWeekResources(db.pool,{worldId,requestId,expectedRevision});
  const consume=(showId:string,promotionId:string,requestId:string,expectedRevision:number)=>
    consumeShowAppearances(db.pool,{worldId,showId,promotionId,requestId,expectedRevision,playerId:"system"});
  const balances=()=>withWorldTransaction(db.pool,tx=>tx.query<{contract_id:string;remaining_dates:number}>(
    "SELECT contract_id,remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId],
  ));
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Clearance World",seed:13,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:promoA,name:"A",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:promoB,name:"B",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'venue-a','A'),($1,'venue-b','B')",[worldId]);
      await tx.query("INSERT INTO ppw_people(world_id,person_id,name,weekly_service_capacity) VALUES($1,$2,'Shared',2)",[worldId,personId]);
      await tx.query(
        `INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
         VALUES($1,$2,$4,$5,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20),
               ($1,$3,$4,$6,'LIMITED_NON_EXCLUSIVE','SIGNED',2,20)`,
        [worldId,contractA,contractB,personId,promoA,promoB],
      );
      await tx.query(
        `INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id)
         VALUES($1,$2,$4,1,1,'SUBMITTED',3,'venue-a'),
               ($1,$3,$5,1,1,'SUBMITTED',3,'venue-b')`,
        [worldId,showA,showB,promoA,promoB],
      );
      await tx.query(
        `INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
         VALUES($1,$2,'first',0,'MATCH',$4::jsonb),
               ($1,$3,'second',0,'MATCH',$5::jsonb)`,
        [worldId,showA,showB,
          JSON.stringify({participants:[{personId,contractId:contractA}]}),
          JSON.stringify({participants:[{personId,contractId:contractB}]})],
      );
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
    });
    await assert.rejects(clear("blocked",0),/WRESTLER_DAY_CONFLICT/);
    await assert.rejects(consume(showA,promoA,"too-soon",0),/resource clearance required/);
    assert.deepEqual((await balances()).map(r=>r.remaining_dates),[2,2]);

    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_booking_drafts SET show_day=4 WHERE world_id=$1 AND draft_id=$2",[worldId,showB],
    ));
    const requestId="clear-"+suffix;
    const approved=await clear(requestId,0);
    assert.equal(approved.status,"APPLIED");
    assert.deepEqual(approved.result,{year:1,week:1,eligiblePromotions:2,inspectedSlots:2});
    assert.equal((await clear(requestId,0)).status,"REPLAYED");
    await assert.rejects(clear("second-clear",1),/already cleared/);

    // Contract changes after clearance must still fail safely before dates
    // are consumed, rather than partially charging a contested show.
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_contracts SET status='TERMINATED' WHERE world_id=$1 AND contract_id=$2",[worldId,contractB],
    ));
    await assert.rejects(consume(showB,promoB,"invalidated",1),/Contract unavailable/);
    assert.deepEqual((await balances()).map(r=>r.remaining_dates),[2,2]);
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_contracts SET status='SIGNED' WHERE world_id=$1 AND contract_id=$2",[worldId,contractB],
    ));

    const first=await consume(showA,promoA,"consume-a",1);
    assert.equal(first.status,"APPLIED");
    assert.deepEqual(first.result,{performers:1,datesCharged:1});
    const second=await consume(showB,promoB,"consume-b",2);
    assert.equal(second.status,"APPLIED");
    assert.deepEqual(second.result,{performers:1,datesCharged:1});
    assert.deepEqual((await balances()).map(r=>r.remaining_dates),[1,1]);
    assert.equal((await consume(showB,promoB,"consume-b",2)).status,"REPLAYED");
    const report=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
    assert.equal(report.provisionalClear,true);
    const clearances=await withWorldTransaction(db.pool,tx=>tx.query<{eligible_promotions:number}>(
      "SELECT eligible_promotions FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId],
    ));
    assert.deepEqual(clearances,[{eligible_promotions:2}]);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_show_resolutions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_resource_clearances WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
