import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {previewWorldWeekArbitration} from "../src/db/week-arbitration.js";
import {recordWorldWeekArbitration,readRecordedWeekArbitration} from "../src/db/recorded-week-arbitration.js";
import {clearWorldWeekResources} from "../src/db/week-clearance.js";

const url=process.env.PPW_NEON_TEST_URL;
test("durable provisional arbitration: racing workers, retries, stale cards, zero charges",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="proposal-"+id;
  const a="a-"+id,b="b-"+id,showA="show-a-"+id,showB="show-b-"+id;
  const runner=(requestId:string,expectedRevision:number,expectedStateFingerprint:string)=>
    recordWorldWeekArbitration(db.pool,{worldId,requestId,expectedRevision,expectedStateFingerprint});
  try{
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Proposals",seed:42,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:a,name:"A",tier:"LOCAL"});
      await addPromotion(tx,worldId,{id:b,name:"B",tier:"LOCAL"});
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'venue','Venue')",[worldId]);
      await tx.query(
        "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,1,'SUBMITTED',3,'venue'),($1,$4,$5,1,1,'SUBMITTED',3,'venue')",
        [worldId,showA,a,showB,b],
      );
      await tx.query(
        "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'card-a',0,'SEGMENT',$4::jsonb),($1,$3,'card-b',0,'SEGMENT',$4::jsonb)",
        [worldId,showA,showB,JSON.stringify({participants:[],creativeOutcome:"approved"})],
      );
      await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[worldId]);
    });
    const preview=await previewWorldWeekArbitration(db.pool,worldId);
    assert.equal(preview.outcomes.length,1);
    await assert.rejects(runner("bad-preview",0,"0".repeat(64)),/stale/);
    await assert.rejects(clearWorldWeekResources(db.pool,{worldId,requestId:"still-conflicted",expectedRevision:0}),/VENUE_DAY_CONFLICT/);
    const reqA="proposal-a",reqB="proposal-b";
    const race=await Promise.all([
      runner(reqA,0,preview.stateFingerprint),runner(reqB,0,preview.stateFingerprint),
    ]);
    assert.equal(race.filter(x=>x.status==="APPLIED").length,1);
    assert.equal(race.filter(x=>x.status==="STALE").length,1);
    const winning=race[0]!.status==="APPLIED"?reqA:reqB;
    assert.equal((await runner(winning,0,preview.stateFingerprint)).status,"REPLAYED");
    await assert.rejects(runner("another",1,preview.stateFingerprint),/already recorded/);
    let stored=await readRecordedWeekArbitration(db.pool,worldId);
    assert.equal(stored.status,"CURRENT");
    if(stored.status==="CURRENT")assert.deepEqual(stored.outcomes,preview.outcomes);
    const shows=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:string}>(
      "SELECT count(*)::text AS remaining_dates FROM ppw_show_resolutions WHERE world_id=$1",[worldId],
    ));
    assert.equal(shows[0]!.remaining_dates,"0");

    // This edits only the scripted segment text, NOT the venue claims. The
    // stored fingerprint must still detect the altered card.
    await withWorldTransaction(db.pool,tx=>tx.query(
      `UPDATE ppw_card_slots SET payload=jsonb_set(payload,'{creativeOutcome}','"changed"')
       WHERE world_id=$1 AND draft_id=$2`,[worldId,showA],
    ));
    stored=await readRecordedWeekArbitration(db.pool,worldId);
    assert.equal(stored.status,"STALE");
    // No mutation of match winners, booked resources, nor roster dates.
    const script=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{creativeOutcome:string}}>(
      "SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2",[worldId,showB],
    ));
    assert.equal(script[0]!.payload.creativeOutcome,"approved");
  } finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_week_arbitration_proposals WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
