import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {setStaffContinuityAsActor} from "../src/api/world-service.js";
import {lockWorldWeek,beginWorldResolution} from "../src/db/world-lock.js";
import {recordWeekContinuity} from "../src/db/week-continuity.js";
import {finalizePreparedWorldShows} from "../src/db/finalize-prepared-shows.js";
import {generateWeekStaffFallbackCards} from "../src/db/generate-staff-fallback-cards.js";
import {inspectWeekConflicts} from "../src/db/week-conflicts.js";

const url=process.env.PPW_NEON_TEST_URL;
test("staff generates only delegated missing shows, preserving absent/unassigned and unresolved shows",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,4),id=randomUUID(),worldId="staff-card-"+id;
  const promotions=["delegated-"+id,"no-consent-"+id,"ai-"+id,"insufficient-"+id];
  const players=["owner-"+id,"other-"+id,"lowroster-"+id];
  const people=["a-"+id,"b-"+id,"c-"+id];
  const contracts=people.map((_,i)=>"c-"+i+"-"+id);
  const run=(requestId:string,expectedRevision:number)=>
    generateWeekStaffFallbackCards(db.pool,{worldId,requestId,expectedRevision});
  try{
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Staff Emergency",seed:912,rulesetVersion:"test"});
      for(let i=0;i<4;i++)
        await addPromotion(tx,worldId,{id:promotions[i]!,name:"Promotion "+i,tier:"LOCAL"});
      for(let i=0;i<3;i++){
        await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[players[i]!]);
        await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
          [worldId,players[i]!]);
        const controlled=[0,1,3][i]!;
        await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
          [worldId,players[i]!,promotions[controlled]!]);
      }
      await tx.query("UPDATE ppw_promotions SET management_mode='AI' WHERE world_id=$1 AND promotion_id=$2",
        [worldId,promotions[2]!]);
      await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name) VALUES($1,'main','Main'),($1,'spare','Spare')",
        [worldId]);
      for(let i=0;i<3;i++){
        await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,$4)",
          [worldId,people[i]!,"Talent "+i,i===2?"WOMEN":"MEN"]);
        await tx.query(
          `INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
            VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',2,52)`,
          [worldId,contracts[i]!,people[i]!,promotions[i===2?3:0]!],
        );
      }
      await tx.query(
        "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,1,'SUBMITTED',3,'main')",
        [worldId,"ai-show-"+id,promotions[2]!],
      );
      await tx.query(
        "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'promo',0,'SEGMENT',$3::jsonb)",
        [worldId,"ai-show-"+id,JSON.stringify({participants:[],creativeOutcome:"fixed"})],
      );
    });
    for(const [i,revision] of [[0,0],[2,1]] as const){
      const x=await setStaffContinuityAsActor({pool:db.pool,actor:{playerId:players[i]!}},
        {worldId,promotionId:promotions[i===0?0:3]!,allowUnfinishedFallback:true,
          requestId:"delegated-"+i,expectedRevision:revision});
      assert.equal(x.status,"APPLIED");
    }
    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
      [worldId],
    ));
    assert.equal((await lockWorldWeek(db.pool,{worldId,requestId:"lock",expectedRevision:2})).status,"APPLIED");
    const snapshot=await recordWeekContinuity(db.pool,{worldId,requestId:"assessment",expectedRevision:3});
    assert.equal(snapshot.status,"APPLIED");
    if(snapshot.status==="APPLIED"){
      assert.equal(snapshot.result.counts.STAFF_FALLBACK_ELIGIBLE,2);
      assert.equal(snapshot.result.counts.PLAYER_ACTION_REQUIRED,1);
      assert.equal(snapshot.result.counts.SUBMITTED_READY,1);
    }
    assert.equal((await finalizePreparedWorldShows(db.pool,
      {worldId,requestId:"prepared",expectedRevision:4})).status,"APPLIED");
    assert.equal((await beginWorldResolution(db.pool,
      {worldId,requestId:"resolution",expectedRevision:5})).status,"APPLIED");
    assert.equal((await run("stale",5)).status,"STALE");
    const result=await run("staff-missing",6);
    assert.equal(result.status,"APPLIED");
    if(result.status!=="APPLIED")throw new Error("Expected staff run");
    assert.equal(result.result.generated.length,1);
    assert.deepEqual(result.result.unfilled,[{
      promotionId:promotions[3],reason:"NO_ELIGIBLE_PAIR",
    }]);
    const created=result.result.generated[0]!;
    assert.equal(created.promotionId,promotions[0]);
    assert.equal((await run("staff-missing",6)).status,"REPLAYED");
    await assert.rejects(run("new-request",7),/already evaluated/);
    const booked=await withWorldTransaction(db.pool,tx=>tx.query<{
      promotion_id:string;status:string;booking_origin:string;show_day:number;venue_id:string;
    }>("SELECT promotion_id,status,booking_origin,show_day,venue_id FROM ppw_booking_drafts WHERE world_id=$1 ORDER BY draft_id",
      [worldId]));
    assert.equal(booked.length,2);
    const staff=booked.find(x=>x.booking_origin==="STAFF_FALLBACK")!;
    assert.equal(staff.status,"SUBMITTED");
    assert.ok(!(staff.show_day===3&&staff.venue_id==="main"));
    const slot=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{
      participants:{personId:string;contractId:string}[];
      scriptedWinner:string;scriptedBy:string;matchType:string;staffFallback:boolean;
    }}>("SELECT payload FROM ppw_card_slots WHERE world_id=$1 AND draft_id=$2",
      [worldId,created.showId]));
    assert.equal(slot.length,1);
    assert.equal(slot[0]!.payload.scriptedBy,"DELEGATED_STAFF");
    assert.equal(slot[0]!.payload.staffFallback,true);
    assert.equal(slot[0]!.payload.matchType,"SINGLES");
    assert.deepEqual(slot[0]!.payload.participants.map(p=>p.personId).sort(),people.slice(0,2).sort());
    assert.ok(slot[0]!.payload.participants.some(p=>p.personId===slot[0]!.payload.scriptedWinner));
    const report=await withWorldTransaction(db.pool,tx=>inspectWeekConflicts(tx,worldId));
    assert.ok(!report.blockers.some(b=>b.showIds.includes(created.showId)));
    const dates=await withWorldTransaction(db.pool,tx=>tx.query<{remaining_dates:number}>(
      "SELECT remaining_dates FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id",[worldId],
    ));
    assert.deepEqual(dates.map(x=>x.remaining_dates),[2,2,2]);
    const resolution=await withWorldTransaction(db.pool,tx=>tx.query<{count:string}>(
      "SELECT count(*)::text AS count FROM ppw_show_resolutions WHERE world_id=$1",[worldId],
    ));
    assert.equal(resolution[0]!.count,"0");
    const ledger=await withWorldTransaction(db.pool,tx=>tx.query<{payload:{
      staffAuthored:boolean;generated:{promotionId:string}[];
    }}>(
      "SELECT payload FROM ppw_ledger_events WHERE world_id=$1 AND event_type='STAFF_FALLBACK_CARDS_CREATED'",
      [worldId]));
    assert.equal(ledger.length,1);
    assert.equal(ledger[0]!.payload.staffAuthored,true);
  }finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_ledger_events WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_staff_fallback_runs WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_prepared_finalizations WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_continuity_assessments WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_staff_continuity_settings WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      for(const player of players)await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
