import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { postgresPool } from "../src/db/postgres.js";
import { withWorldTransaction,type TransactionPool } from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import { createWorld, addPromotion } from "../src/db/world-operations.js";
import { joinWorld } from "../src/db/membership-operations.js";
import { submitPromotionClaim } from "../src/db/promotion-commands.js";
import { readPlayerWorldOverview } from "../src/db/player-world-overview.js";
import { listAvailablePromotions } from "../src/db/available-promotions.js";

const url=process.env.PPW_NEON_TEST_URL;
test("overview and promotion picker only expose relevant narrow records",{skip:!url?"No disposable PostgreSQL":false},async()=>{
  const db=postgresPool(url!,3),id=randomUUID(),worldId="overview-"+id,playerId="viewer-"+id;
  const first="a-"+id,second="b-"+id;
  try {
    await withWorldTransaction(db.pool,async tx=>{
      await createWorld(tx,{id:worldId,name:"Overview World",seed:5,rulesetVersion:"test"});
      await addPromotion(tx,worldId,{id:first,name:"First Promotion",tier:"LOCAL"});
      await tx.query(`UPDATE ppw_promotions SET last_weekly_net=-125,runway_weeks=9.5,
       financial_distress='WATCH' WHERE world_id=$1 AND promotion_id=$2`,[worldId,first]);
      await addPromotion(tx,worldId,{id:second,name:"Second Promotion",tier:"REGIONAL"});
    });
    const meter=new MeasuredQuerySession("home-overview-one-SQL");
    const measured:TransactionPool={async connect(){
     const client=await db.pool.connect();
     return {release(){client.release();},
      async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
       return meter.execute(()=>client.query<T>(sql,params));
      }};
    }};
    const before=await readPlayerWorldOverview(measured,worldId,playerId);
    assert.equal(meter.assertBudget({maxQueries:1,maxResultBytes:1700}).queryCount,1);
    assert.ok(Number.isFinite(before?.world.nextLockEpoch));
    assert.ok(Number.isFinite(before?.world.serverEpoch));
    assert.ok(before!.world.nextLockEpoch>before!.world.serverEpoch);
    assert.equal(before?.membership,"NONE");
    assert.equal(before?.promotion,null);
    assert.deepEqual((await listAvailablePromotions(db.pool,worldId,null,1)).map(p=>p.id),[first]);
    assert.deepEqual((await listAvailablePromotions(db.pool,worldId,first,1)).map(p=>p.id),[second]);
    await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+id,expectedRevision:0});
    await submitPromotionClaim(db.pool,{worldId,playerId,promotionId:first,requestId:"claim-"+id,expectedRevision:1});
    const after=await readPlayerWorldOverview(measured,worldId,playerId);
    assert.equal(meter.assertBudget({maxQueries:2,maxResultBytes:3600}).queryCount,2);
    assert.equal(after?.membership,"ACTIVE");
    assert.equal(after?.world.revision,2);
    assert.equal(after?.promotion?.id,first);
    assert.equal(after?.promotion?.lastWeeklyNet,-125);
    assert.equal(after?.promotion?.runwayWeeks,9.5);
    assert.equal(after?.promotion?.financialDistress,"WATCH");
    assert.deepEqual(after?.promotion?.attention,{
     unpreparedShow:false,pendingBackstage:false,expiringTalent:false,
     pendingContractOffers:false,plannedShows:0,
     backstageRequests:[],offerResults:[],backstageResults:[],businessUpdates:[],
     contractAlerts:[],titleNews:[],injuryNews:[]});
    assert.equal(after?.membership,"ACTIVE");
    assert.ok(after!.world.nextLockEpoch>after!.world.serverEpoch);
    await withWorldTransaction(db.pool,async tx=>{
     await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES"+
      " ($1,'no-dates','Ada'),($1,'expiring','Bert'),"+
      " ($1,'future','Cora'),($1,'outsider','Dylan')",[worldId]);
     await tx.query(
      "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,"+
      "family,status,start_week_index,expires_week_index,remaining_dates) VALUES"+
      " ($1,'none','no-dates',$2,'LIMITED_NON_EXCLUSIVE','SIGNED',0,25,0),"+
      " ($1,'soon','expiring',$2,'LIMITED_NON_EXCLUSIVE','SIGNED',0,1,3),"+
      " ($1,'later','future',$2,'LIMITED_NON_EXCLUSIVE','SIGNED',5,25,0),"+
      " ($1,'private','outsider',$3,'LIMITED_NON_EXCLUSIVE','SIGNED',0,0,0)",
      [worldId,first,second]);
     await tx.query("INSERT INTO ppw_contract_date_requests("+
      "world_id,request_id,contract_id,promotion_id,person_id,"+
      "additional_dates,status,created_week_index)"+
      " VALUES($1,'date-request','none',$2,'no-dates',5,'PENDING',0)",
      [worldId,first]);
    });
    const contractMeter=new MeasuredQuerySession("named-owner-contract-alerts");
    const contractPool:TransactionPool={async connect(){
     const client=await db.pool.connect();
     return {release(){client.release();},
      async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
       return contractMeter.execute(()=>client.query<T>(sql,params));
      }};
    }};
    const named=await readPlayerWorldOverview(contractPool,worldId,playerId);
    assert.equal(contractMeter.assertBudget({maxQueries:1,maxResultBytes:4500}).queryCount,1);
    assert.deepEqual(named?.promotion?.attention.contractAlerts,[
     {contractId:"none",personId:"no-dates",name:"Ada",
      kind:"DATES_EXHAUSTED",weeksRemaining:25,waiting:true},
     {contractId:"soon",personId:"expiring",name:"Bert",
      kind:"EXPIRING",weeksRemaining:1,waiting:false}
    ]);
    assert.equal(named?.promotion?.attention.expiringTalent,true);
    const outsider=await readPlayerWorldOverview(measured,worldId,"outsider-"+id);
    assert.equal(outsider?.promotion,null);
    assert.equal(outsider?.membership,"NONE");
    assert.equal(meter.assertBudget({maxQueries:3,maxResultBytes:5400}).queryCount,3);
    assert.deepEqual((await listAvailablePromotions(db.pool,worldId)).map(p=>p.id),[second]);
    await assert.rejects(listAvailablePromotions(db.pool,worldId,null,51),/page size/);
  } finally {
    await withWorldTransaction(db.pool,async tx=>{
      await tx.query("DELETE FROM ppw_contract_date_requests WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_contracts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_people WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_command_receipts WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotion_controls WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_memberships WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[worldId]);
      await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
      await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
    }).finally(()=>db.close());
  }
});
