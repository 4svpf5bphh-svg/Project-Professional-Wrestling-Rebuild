import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {recruitStrategicAiRosters} from "../src/db/living-world-promotions.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";

const url=process.env.PPW_NEON_TEST_URL;

/** Twelve-promotion quarterly recruitment stress: two genuine human owners,
 * ten AI rivals, candidate contention and uneven wage/cash constraints.
 * Uses ONLY a disposable PostgreSQL World; never an online World or cron.
 * This is a bounded competition/Neon workload, not a forecast of AI growth.
 */
test("twelve-promotion World shares scarce talent fairly without runaway AI wages or SQL reads",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="scaled-ai-"+randomUUID(),db=postgresPool(url!,3);
 const humans=["owner-"+randomUUID(),"owner-"+randomUUID()];
 const ai=Array.from({length:10},(_,i)=>"ai-"+String(i).padStart(2,"0"));
 const promotions=[...ai,"human-a","human-b"];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Twelve-promotion financial scale",seed:714,rulesetVersion:"test"});
   for(const id of promotions)await addPromotion(tx,world,{id,name:id,tier:"LOCAL"});
   await tx.query(`
    UPDATE ppw_promotions SET
     management_mode=CASE WHEN promotion_id LIKE 'ai-%' THEN 'AI' ELSE 'HUMAN' END,
     cash=CASE WHEN promotion_id='ai-09' THEN 2000 ELSE 500000 END,
     weekly_fixed_overhead=1000,weekly_media_income=30000,
     weekly_sponsor_income=5000,financial_distress='HEALTHY',
     last_weekly_net=8000,event_cadence_weeks=2,
     ai_risk_tolerance=CASE WHEN promotion_id IN
      ('ai-01','ai-03','ai-05','ai-07') THEN 80 ELSE 20 END,
     ai_match_quality_preference=CASE WHEN promotion_id IN
      ('ai-01','ai-03','ai-05','ai-07') THEN 25 ELSE 95 END,
     ai_star_preference=CASE WHEN promotion_id IN
      ('ai-01','ai-03','ai-05','ai-07') THEN 95 ELSE 30 END
    WHERE world_id=$1`,[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",humans);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')`,[world,...humans]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'human-a'),($1,$3,'human-b')`,[world,...humans]);
   await tx.query(`INSERT INTO ppw_staff_employments(
    world_id,employment_id,staff_id,promotion_id,role,status,
    weekly_salary,start_week_index,expires_week_index,term_weeks)
    VALUES($1,'scaled-wages','scaled-senior-agent','ai-08','ROAD_AGENT',
     'ACTIVE',40000,0,103,104)`,[world]);
   const people=Array.from({length:128},(_,i)=>({
    id:"free-"+String(i).padStart(3,"0"),
    ring:i%2===0?89:46,craft:i%2===0?91:48,
    presentation:i%2===0?45:93,popularity:i%2===0?26:64
   }));
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,
     career_stage,recognition,popularity,in_ring_quality,match_craft,
     presentation,contract_priorities)
    SELECT $1,x.id,x.id,'ACTIVE','PROSPECT',25,x.popularity,
     x.ring,x.craft,x.presentation,
     '{"money":10,"role":95,"prestige":30,"schedule":50,"loyalty":60,"exposure":100}'::jsonb
    FROM jsonb_to_recordset($2::jsonb)
     x(id text,ring integer,craft integer,presentation integer,popularity integer)`,
    [world,JSON.stringify(people)]);
  });
  const meter=new MeasuredQuerySession("twelve-promotion-quarterly-recruitment");
  const first=await withWorldTransaction(db.pool,async tx=>{
   const measured={query:<T extends Record<string,unknown>>(
    sql:string,args:readonly unknown[])=>meter.execute(()=>tx.query<T>(sql,args))};
   return recruitStrategicAiRosters(measured,world,1,14);
  });
  assert.deepEqual(first,{eligible:8,signed:8},
   "Only the solvent, properly staffed AI companies can each make one deal");
  const measure=meter.assertBudget({maxQueries:6,maxResultBytes:90000});
  assert.ok(measure.queryCount<=4,
   "AI quarter must retain constant query count as company count grows");
  const duplicate=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,14));
  assert.deepEqual(duplicate,{eligible:0,signed:0},
   "Replayed certified quarter never issues a second set of deals");
  const second=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,27));
  assert.deepEqual(second,{eligible:8,signed:8});
  // This company can finally afford talent once its real staff wage burden falls.
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_staff_employments SET weekly_salary=500
   WHERE world_id=$1 AND employment_id='scaled-wages'`,[world]));
  const third=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,40));
  assert.deepEqual(third,{eligible:9,signed:9});
  const signed=await withWorldTransaction(db.pool,tx=>tx.query<{
   contract_id:string;person_id:string;promotion_id:string;
   weekly_guarantee:string;status:string;family:string;
   start_week_index:number;expires_week_index:number;
  }>(`SELECT contract_id,person_id,promotion_id,weekly_guarantee::text,
    status,family,start_week_index,expires_week_index FROM ppw_contracts WHERE world_id=$1
    AND contract_id LIKE 'strategic:%' ORDER BY contract_id`,[world]));
  assert.equal(signed.length,25);
  assert.equal(new Set(signed.map(x=>x.contract_id)).size,signed.length);
  for(const quarter of [13,26,39]){
   const wave=signed.filter(x=>x.contract_id.startsWith("strategic:"+quarter+":"));
   assert.equal(new Set(wave.map(x=>x.person_id)).size,wave.length,
    "Concurrent quarterly AI companies cannot take the same free agent");
  }
  // A worker can be signed again AFTER their earlier limited contract expires,
  // but multiple rival contracts cannot overlap in active service dates.
  for(let i=0;i<signed.length;i++)for(let j=i+1;j<signed.length;j++){
   const a=signed[i]!,b=signed[j]!;
   if(a.person_id===b.person_id)
    assert.ok(a.expires_week_index<b.start_week_index||
     b.expires_week_index<a.start_week_index,
     "No two strategic recruitment deals can overlap for the same person");
  }
  assert.ok(signed.every(x=>ai.includes(x.promotion_id)&&x.promotion_id!=="ai-09"));
  assert.equal(signed.filter(x=>x.promotion_id==="ai-08").length,1,
   "A financially overcommitted rival must only hire after staff costs decline");
  assert.ok(signed.every(x=>x.status==="SIGNED"&&
   x.family==="LIMITED_NON_EXCLUSIVE"&&
   Number(x.weekly_guarantee)>0&&Number(x.weekly_guarantee)<=5100));
  const owners=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;player_id:string;active:boolean
  }>(`SELECT promotion_id,player_id,active FROM ppw_promotion_controls
    WHERE world_id=$1 ORDER BY promotion_id`,[world]));
  assert.deepEqual(owners,[
   {promotion_id:"human-a",player_id:humans[0],active:true},
   {promotion_id:"human-b",player_id:humans[1],active:true}
  ]);
  console.log("PPW 12-promotion quarterly Neon budget:",JSON.stringify({
   budget:measure,first,second,third,totalContracts:signed.length,humanOwners:owners.length
  }));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_staff_employments",
    "ppw_promotion_talent_trust","ppw_promotion_survival","ppw_contracts",
    "ppw_promotion_controls","ppw_memberships","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[humans]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
