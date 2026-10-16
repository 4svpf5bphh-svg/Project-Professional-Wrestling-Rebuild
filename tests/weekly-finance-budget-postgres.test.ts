import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleWeeklyPromotionHealth} from "../src/db/weekly-finance-health.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
const url=process.env.PPW_NEON_TEST_URL;

/** 643 wrestlers, eight promotions and 100 historical PPW years must not
 * expand the data returned to the weekly finance settlement. A single
 * indexed current-week aggregation is independent of total World age.
 */
test("PostgreSQL: 100 years of financial history, current week settles in 3 statements and one result row",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const world="finance-"+randomUUID(),db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Long-lived PPW finance",seed:143,rulesetVersion:"test"});
   for(let i=0;i<8;i++)await addPromotion(tx,world,{
    id:"promo-"+i,name:"Promotion "+i,tier:"NATIONAL"});
   await tx.query(`UPDATE ppw_promotions SET
    cash=CASE WHEN promotion_id='promo-1' THEN 500 ELSE 100000 END,
    last_weekly_net=0,financial_distress='HEALTHY',
    weekly_media_income=CASE WHEN promotion_id='promo-1' THEN 0 ELSE 1000 END,
    weekly_sponsor_income=CASE WHEN promotion_id='promo-1' THEN 0 ELSE 300 END,
    weekly_fixed_overhead=CASE WHEN promotion_id='promo-1' THEN 1000 ELSE 500 END
    WHERE world_id=$1`,[world]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name)
    SELECT $1,'worker-'||g,'Wrestler '||g FROM generate_series(1,643) AS g`,[world]);
   await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    SELECT $1,((g-1)/52)::integer+1,((g-1)%52)::integer+1,
     'PROMOTION_RECURRING_FINANCES',jsonb_build_object('promotionId','promo-0','net',50)
    FROM generate_series(1,5200) AS g`,[world]);
   await tx.query(`INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
    SELECT $1,101,1,'PROMOTION_RECURRING_FINANCES',
     jsonb_build_object('promotionId','promo-'||g,
      'net',CASE WHEN g=1 THEN -1000 ELSE 800 END)
    FROM generate_series(0,7) AS g`,[world]);
   await tx.query("UPDATE ppw_worlds SET year=101,week=1,phase='RESOLVING' WHERE world_id=$1",[world]);
  });
  const meter=new MeasuredQuerySession("indexed-financial-rollover-100-years");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const result=await withWorldTransaction(measured,tx=>settleWeeklyPromotionHealth(tx,world,101,1));
  assert.deepEqual(result,{evaluated:8,distressChanges:1});
  const sample=meter.assertBudget({maxQueries:3,maxResultBytes:500});
  assert.equal(sample.queryCount,3);
  assert.equal(sample.resultRows,1);
  console.log("PPW 100-year weekly finance SQL budget:",JSON.stringify(sample));
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;last_weekly_net:string;runway_weeks:number|null;financial_distress:string}>(`
    SELECT promotion_id,last_weekly_net,runway_weeks,financial_distress
    FROM ppw_promotions WHERE world_id=$1 ORDER BY promotion_id`,[world]));
  assert.equal(rows.length,8);
  assert.equal(Number(rows[0]!.last_weekly_net),800);
  assert.equal(rows[0]!.runway_weeks,null);
  assert.equal(rows[1]!.financial_distress,"CRISIS");
  assert.equal(rows[1]!.runway_weeks,0.5);
  assert.equal(Number(rows[1]!.last_weekly_net),-1000);
  const logged=await withWorldTransaction(db.pool,tx=>tx.query<{event_type:string;payload:{
   promotionId:string;from:string;to:string}}>(`
    SELECT event_type,payload FROM ppw_ledger_events WHERE world_id=$1 AND
      year=101 AND week=1 AND event_type='FINANCIAL_DISTRESS_CHANGED'`,[world]));
  assert.equal(logged.length,1);
  assert.deepEqual(logged[0]!.payload.promotionId,"promo-1");
  assert.equal(logged[0]!.payload.from,"HEALTHY");
  assert.equal(logged[0]!.payload.to,"CRISIS");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_people","ppw_promotions"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
