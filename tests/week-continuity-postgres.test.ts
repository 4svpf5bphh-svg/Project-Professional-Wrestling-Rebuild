import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {setStaffContinuityAsActor} from "../src/api/world-service.js";
import {recordWeekContinuity,inspectWeekContinuity} from "../src/db/week-continuity.js";
import {lockWorldWeek} from "../src/db/world-lock.js";

const url=process.env.PPW_NEON_TEST_URL;
test("continuity: submitted and prepared work protected, opt-in only, AI distinct, one locked snapshot",
  {skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,4),id=randomUUID(),worldId="continuity-"+id;
  const promotions=Array.from({length:7},(_,i)=>"promotion-"+i+"-"+id);
  const players=Array.from({length:5},(_,i)=>"player-"+i+"-"+id);
  const actor=(playerId:string)=>({pool:db.pool,actor:{playerId}});
  const setting=(who:number,promotion:number,value:boolean,req:string,rev:number)=>
    setStaffContinuityAsActor(actor(players[who]!),{worldId,promotionId:promotions[promotion]!,
      allowUnfinishedFallback:value,requestId:req,expectedRevision:rev});
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Continuity Fixture",seed:42,rulesetVersion:"test"});
      for(let i=0;i<promotions.length;i++)
        await addPromotion(tx,worldId,{id:promotions[i]!,name:"Promotion "+i,tier:"LOCAL"});
      for(let i=0;i<players.length;i++){
        await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[players[i]!]);
        await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
          [worldId,players[i]!]);
        await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
          [worldId,players[i]!,promotions[i]!]);
      }
      await tx.query("UPDATE ppw_promotions SET management_mode='AI' WHERE world_id=$1 AND promotion_id=$2",
        [worldId,promotions[5]!]);
      const makeDraft=async(i:number,status:"DRAFT"|"SUBMITTED",valid:boolean)=>{
        await tx.query(
          "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,venue_id) VALUES($1,$2,$3,1,1,$4,$5,$6)",
          [worldId,"draft-"+i+"-"+id,promotions[i]!,status,valid?3:null,valid?"venue":null],
        );
        if(valid)await tx.query(
          "INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload) VALUES($1,$2,'slot',0,'SEGMENT',$3::jsonb)",
          [worldId,"draft-"+i+"-"+id,JSON.stringify({participants:[],scriptedOutcome:"protected"})],
        );
      };
      await makeDraft(0,"SUBMITTED",true);
      await makeDraft(1,"DRAFT",true);
      await makeDraft(4,"SUBMITTED",false);
      // index 5 is AI; index 6 is an explicitly unassigned promotion.
    });
    const first=await setting(2,2,true,"allow-"+id,0);
    assert.equal(first.status,"APPLIED");
    assert.deepEqual(first.result,{promotionId:promotions[2],allowUnfinishedFallback:true});
    assert.equal((await setting(2,2,true,"allow-"+id,0)).status,"REPLAYED");
    const disable=await setting(3,3,false,"deny-"+id,1);
    assert.equal(disable.status,"APPLIED");
    const delegate=await setStaffContinuityAsActor(actor(players[2]!),{
      worldId,promotionId:promotions[2]!,allowUnfinishedFallback:true,
      allowLogisticsFallback:true,permittedDays:[2,4],
      permittedVenueIds:["venue"],requestId:"logistics-"+id,expectedRevision:2,
    });
    assert.equal(delegate.status,"APPLIED");
    const legacy=await setting(2,2,false,"legacy-update-"+id,3);
    assert.equal(legacy.status,"APPLIED");
    const preserved=await withWorldTransaction(db.pool,tx=>tx.query<{
      allow_logistics_fallback:boolean;permitted_days:number[];permitted_venue_ids:string[];
    }>("SELECT allow_logistics_fallback,permitted_days,permitted_venue_ids FROM ppw_staff_continuity_settings WHERE world_id=$1 AND promotion_id=$2",
      [worldId,promotions[2]!]));
    assert.deepEqual(preserved,[{allow_logistics_fallback:true,permitted_days:[2,4],permitted_venue_ids:["venue"]}]);
    await assert.rejects(setting(2,0,true,"not-owner-"+id,4),/active promotion controller/);
    await assert.rejects(setting(0,5,true,"claim-ai-"+id,4),/active promotion controller/);
    await assert.rejects(recordWeekContinuity(db.pool,{worldId,requestId:"early-"+id,expectedRevision:4}),
      /World must be locked/);

    await withWorldTransaction(db.pool,tx=>tx.query(
      "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '1 second' WHERE world_id=$1",
      [worldId],
    ));
    await assert.rejects(setting(2,2,false,"late-"+id,4),/booking deadline passed/);
    const locked=await lockWorldWeek(db.pool,{worldId,requestId:"lock-"+id,expectedRevision:4});
    assert.equal(locked.status,"APPLIED");

    const snapshot=await withWorldTransaction(db.pool,tx=>inspectWeekContinuity(tx,worldId));
    assert.deepEqual(snapshot.assessment.map(x=>x.status),[
      "SUBMITTED_READY","PREPARED_DRAFT","PLAYER_ACTION_REQUIRED",
      "PLAYER_ACTION_REQUIRED","SUBMITTED_REVIEW","AI_MANAGED","UNASSIGNED",
    ]);
    assert.equal(snapshot.assessment[1]!.showId,"draft-1-"+id);
    assert.equal(snapshot.assessment[2]!.controllerPlayerId,players[2]);

    const input=(req:string)=>({worldId,requestId:req,expectedRevision:5});
    const outcomes=await Promise.all([
      recordWeekContinuity(db.pool,input("snapshot-a-"+id)),
      recordWeekContinuity(db.pool,input("snapshot-b-"+id)),
    ]);
    assert.equal(outcomes.filter(x=>x.status==="APPLIED").length,1);
    assert.equal(outcomes.filter(x=>x.status==="STALE").length,1);
    const winner=outcomes[0]!.status==="APPLIED"?"snapshot-a-"+id:"snapshot-b-"+id;
    assert.equal((await recordWeekContinuity(db.pool,input(winner))).status,"REPLAYED");
    await assert.rejects(recordWeekContinuity(db.pool,{worldId,requestId:"repeat-"+id,expectedRevision:6}),
      /already recorded/);
    const frozen=await withWorldTransaction(db.pool,tx=>tx.query<{controller_player_id:string;permitted_days:number[];permitted_venue_ids:string[]}>(
      "SELECT controller_player_id,permitted_days,permitted_venue_ids FROM ppw_week_logistics_authorizations WHERE world_id=$1 AND promotion_id=$2",
      [worldId,promotions[2]!]));
    assert.deepEqual(frozen,[{controller_player_id:players[2],permitted_days:[2,4],permitted_venue_ids:["venue"]}]);
    const persisted=await withWorldTransaction(db.pool,tx=>tx.query<{status:string}>(
      "SELECT status FROM ppw_week_continuity_assessments WHERE world_id=$1 ORDER BY promotion_id",
      [worldId],
    ));
    assert.deepEqual(persisted.map(x=>x.status),snapshot.assessment.map(x=>x.status));
    const untouched=await withWorldTransaction(db.pool,tx=>tx.query<{status:string}>(
      "SELECT status FROM ppw_booking_drafts WHERE world_id=$1 ORDER BY draft_id",[worldId],
    ));
    assert.deepEqual(untouched.map(x=>x.status),["SUBMITTED","DRAFT","SUBMITTED"]);
  }finally{
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_week_logistics_authorizations WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_week_continuity_assessments WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_staff_continuity_settings WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_venues WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      for(const player of players)await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
