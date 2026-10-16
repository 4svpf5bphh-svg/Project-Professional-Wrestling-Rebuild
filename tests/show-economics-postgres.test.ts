import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {recordCompletedShow} from "../src/db/completed-show-results.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
import {settleCompletedShowEconomics} from "../src/db/show-economics.js";
import {settleWeeklyPromotionHealth} from "../src/db/weekly-finance-health.js";
import {originalShowSettlement,originalExpectedDemand,originalCompetitionFactor,
 originalTicketYield} from "../src/domain/legacy-show-economics.js";
const url=process.env.PPW_NEON_TEST_URL;

test("PostgreSQL: original gate, rival pressure, venue costs and already-paid appearances settle atomically without World scan",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const id=randomUUID(),world="event-"+id,db=postgresPool(url!,3),
  show="show-a",rival="show-b",promoter="promotion-a",opponent="promotion-b";
 const eventReceipt:CompletedShowReceipt={worldId:world,promotionId:promoter,showId:show,year:1,week:1,
  resolutionId:"score-"+id,crowdResponse:78,
  matches:[{matchId:"match",position:0,crowdResponse:78,
   actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],segments:[]};
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[]) =>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Event Economy",seed:42,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET show_economics_enabled=true WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_markets(world_id,market_id,name,audience_potential,
     wrestling_interest,spending_index)
     VALUES($1,'metro','Metro',85,70,100)`,[world]);
   for(const [p,reach] of [[promoter,65],[opponent,90]] as const){
    await addPromotion(tx,world,{id:p,name:p,tier:"LOCAL"});
    await tx.query(`UPDATE ppw_promotions SET cash=10000,media_reach=$3,home_market_id='metro',
     financial_distress='HEALTHY',weekly_media_income=0,
     weekly_sponsor_income=0,weekly_fixed_overhead=0
     WHERE world_id=$1 AND promotion_id=$2`,[world,p,reach]);
    await tx.query(`INSERT INTO ppw_promotion_market_states(world_id,promotion_id,market_id,
     awareness,live_strength,loyalty) VALUES($1,$2,'metro',70,60,55)`,[world,p]);
   }
   await tx.query(`INSERT INTO ppw_venues(world_id,venue_id,name,market_id,
    capacity,weekly_hire_cost,status) VALUES($1,'arena','Arena','metro',1000,10000,'ACTIVE')`,[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,show_day,venue_id,market_id,event_type,ticket_strategy)
    VALUES($1,$2,$3,1,1,'SUBMITTED',2,'arena','metro','REGULAR','STANDARD'),
          ($1,$4,$5,1,1,'SUBMITTED',3,'arena','metro','REGULAR','PREMIUM')`,
    [world,show,promoter,rival,opponent]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,recognition,popularity,
     presentation) VALUES($1,'a','A',70,80,85),($1,'b','B',60,75,80)`,[world]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,'match',0,'MATCH',$3::jsonb)`,
    [world,show,JSON.stringify({matchType:"SINGLES",participants:[
      {personId:"a",contractId:"c-a"},{personId:"b",contractId:"c-b"}],
     scriptedWinner:"a",plannedFinish:"CLEAN_PIN"})]);
   await tx.query(`INSERT INTO ppw_show_resolutions(world_id,show_id,promotion_id,
    resolved_week_index,command_request_id,performers_count,dates_charged)
    VALUES($1,$2,$3,0,'resolve-fixture',2,2)`,[world,show,promoter]);
   await tx.query(`UPDATE ppw_promotions SET cash=8000
     WHERE world_id=$1 AND promotion_id=$2`,[world,promoter]);
   await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    VALUES($1,1,1,'CONTRACT_APPEARANCE_FEES',
      jsonb_build_object('promotionId',$2::text,'showId',$3::text,'amount',2000))`,
    [world,promoter,show]);
   await tx.query("UPDATE ppw_worlds SET phase='RESOLVING' WHERE world_id=$1",[world]);
  });
  assert.equal(await recordCompletedShow(db.pool,eventReceipt),"RECORDED");
  const meter=new MeasuredQuerySession("original-show-economy");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const result=await withWorldTransaction(measured,tx=>settleCompletedShowEconomics(tx,{
   worldId:world,promotionId:promoter,showId:show,year:1,week:1}));
  const sample=meter.assertBudget({maxQueries:10,maxResultBytes:12000});
  assert.equal(sample.queryCount,10);
  console.log("PPW original show economy PostgreSQL budget:",JSON.stringify(sample));
  const local={awareness:70,liveStrength:60,loyalty:55};
  const market={audiencePotential:85,wrestlingInterest:70,spendingIndex:100};
  const people=[{recognition:70,popularity:80,presentation:85},
   {recognition:60,popularity:75,presentation:80}];
  const expected=originalExpectedDemand({promotionId:promoter,marketId:"metro",day:2,
   eventType:"REGULAR",ticketStrategy:"STANDARD",mediaReach:65,market,local,people});
  const factor=originalCompetitionFactor({showId:show,promotionId:promoter,
   marketId:"metro",day:2,mediaReach:65,local},[
    {showId:show,promotionId:promoter,marketId:"metro",day:2,mediaReach:65,local},
    {showId:rival,promotionId:opponent,marketId:"metro",day:3,mediaReach:90,local}]);
  const pure=originalShowSettlement({seed:42,showId:show,expectedDemand:expected,
   competitionFactor:factor,capacity:1000,ticketYield:originalTicketYield("STANDARD",100),
   venueCost:10000,tier:"LOCAL",eventType:"REGULAR",participants:2,
   away:false,appearanceFees:2000});
  assert.deepEqual(result,pure);
  assert.equal(result.totalCost,24000);
  assert.equal(result.incrementalCash,result.netResult+2000);
  const after=await read<{cash:string;receipt_count:number;ledger_count:number;
   recorded_net:string;recorded_attendance:number}>(`
   SELECT p.cash,
    (SELECT count(*)::integer FROM ppw_show_economics WHERE world_id=$1) AS receipt_count,
    (SELECT count(*)::integer FROM ppw_ledger_events WHERE world_id=$1
       AND event_type='SHOW_EVENT_ECONOMICS') AS ledger_count,
    e.net_result AS recorded_net,e.attendance AS recorded_attendance
   FROM ppw_promotions p JOIN ppw_show_economics e ON e.world_id=p.world_id
    AND e.promotion_id=p.promotion_id
   WHERE p.world_id=$1 AND p.promotion_id=$2`,[world,promoter]);
  assert.equal(after[0]!.receipt_count,1);
  assert.equal(after[0]!.ledger_count,1);
  assert.equal(Number(after[0]!.cash),8000+result.incrementalCash);
  assert.equal(Number(after[0]!.recorded_net),result.netResult);
  assert.equal(after[0]!.recorded_attendance,result.attendance);
  await assert.rejects(
   withWorldTransaction(db.pool,tx=>settleCompletedShowEconomics(tx,{
    worldId:world,promotionId:promoter,showId:show,year:1,week:1})),/duplicate key/);
  const again=await read<{cash:string;entries:number}>(`
   SELECT p.cash,(SELECT count(*)::integer FROM ppw_ledger_events
    WHERE world_id=$1 AND event_type='SHOW_EVENT_ECONOMICS') AS entries
   FROM ppw_promotions p WHERE world_id=$1 AND promotion_id=$2`,[world,promoter]);
  assert.equal(Number(again[0]!.cash),Number(after[0]!.cash));
  assert.equal(again[0]!.entries,1);
  // Wages/appearance fees are part of WEEK P&L even though they were
  // already debited before event settlement. No double-counting.
  const health=await withWorldTransaction(db.pool,tx=>
   settleWeeklyPromotionHealth(tx,world,1,1));
  assert.equal(health.evaluated,2);
  const pAndL=await read<{last_weekly_net:string;cash:string}>(`
   SELECT last_weekly_net,cash FROM ppw_promotions
    WHERE world_id=$1 AND promotion_id=$2`,[world,promoter]);
  assert.equal(Number(pAndL[0]!.last_weekly_net),result.incrementalCash-2000);
  assert.equal(Number(pAndL[0]!.cash),8000+result.incrementalCash);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET phase='OPEN' WHERE world_id=$1",[world]));
  await assert.rejects(withWorldTransaction(db.pool,tx=>settleCompletedShowEconomics(tx,{
   worldId:world,promotionId:promoter,showId:show,year:1,week:1})),/requires a submitted show/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_show_economics","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_show_resolutions","ppw_card_slots","ppw_booking_drafts",
    "ppw_people","ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
