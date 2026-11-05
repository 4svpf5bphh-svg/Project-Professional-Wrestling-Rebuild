import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {originalEmergencyAcceptance,recruitStrategicAiRosters,
 strategicRosterNeed} from "../src/db/living-world-promotions.js";

const url=process.env.PPW_NEON_TEST_URL;
const priority={money:0,role:100,prestige:80,schedule:50,loyalty:60,exposure:100};

test("quarterly AI talent needs respect roster depth, women's gap, main-event quality and full rosters",()=>{
 assert.ok(strategicRosterNeed({booking_division:"WOMEN",popularity:80},
  {size:13,target:20,women:1,topPopularity:81})>0);
 assert.ok(strategicRosterNeed({booking_division:"MEN",popularity:88},
  {size:15,target:20,women:8,topPopularity:59})>0);
 assert.equal(strategicRosterNeed({booking_division:"MEN",popularity:60},
  {size:20,target:20,women:10,topPopularity:93}),-100);
 assert.equal(strategicRosterNeed({booking_division:"MEN",popularity:61},
  {size:19,target:20,women:8,topPopularity:90}),-100);
});

test("certified unlocked Legend tag team is scouted together only after AI eligibility; never split or forced",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="legend-recruit-"+randomUUID(),db=postgresPool(url!,3);
 // Acceptance remains deterministic, not forced. Choose a synthetic AI
 // company ID whose two independent wrestlers would both accept.
 const ids=["legend:road-warriors:0","legend:road-warriors:1"];
 const promotion=Array.from({length:150},(_,i)=>"recruit-ai-"+i).find(id=>
  ids.every(personId=>originalEmergencyAcceptance("26",26,id,personId,priority)));
 assert.ok(promotion,"Test should find a natural two-person acceptance combination");
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Legend recruitment",seed:2202,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion!,name:"Technical Territory",tier:"LOCAL"});
   await tx.query(`UPDATE ppw_promotions SET management_mode='AI',
    financial_distress='HEALTHY',cash=800000,weekly_fixed_overhead=1500,
    weekly_media_income=32000,weekly_sponsor_income=9000,last_weekly_net=15000,
    ai_risk_tolerance=15,ai_match_quality_preference=95,ai_star_preference=40
    WHERE world_id=$1`,[world]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,
    career_stage,booking_division,recognition,popularity,in_ring_quality,
    match_craft,presentation,contract_priorities)
    SELECT $1,x.id,x.name,'ACTIVE','PRIME','MEN',
     80,81,91,91,89,$3::jsonb
    FROM jsonb_to_recordset($2::jsonb) x(id text,name text)`,
   [world,JSON.stringify(ids.map((id,i)=>({id,name:i?"Animal":"Hawk"}))),JSON.stringify(priority)]);
   await tx.query(`INSERT INTO ppw_world_news_weeks(world_id,year,week)
    VALUES($1,1,2)`,[world]);
   await tx.query(`INSERT INTO ppw_legend_processed_weeks(world_id,year,week)
    VALUES($1,1,2)`,[world]);
   await tx.query(`INSERT INTO ppw_world_legend_unlocks(
    world_id,legend_id,year,week,metric,evidence_value,person_ids,
    ai_eligible_from_week_index)
    VALUES($1,'road-warriors',1,2,'TAG_CLASSICS',15,$2::text[],14)`,
    [world,ids]);
  });
  // At index=13, locked for the one full human recruitment week.
  const early=await withWorldTransaction(db.pool,tx=>recruitStrategicAiRosters(tx,world,1,14));
  assert.deepEqual(early,{eligible:1,signed:0});
  const recruited=await withWorldTransaction(db.pool,tx=>recruitStrategicAiRosters(tx,world,1,27));
  assert.deepEqual(recruited,{eligible:1,signed:2});
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
   promotion_id:string;person_id:string;start_week_index:number;
   expiry:number;status:string;appearance_fee:string
  }>(`SELECT promotion_id,person_id,start_week_index,
   expires_week_index AS expiry,status,appearance_fee::text
   FROM ppw_contracts WHERE world_id=$1 ORDER BY person_id`,[world]));
  assert.equal(rows.length,2);
  assert.deepEqual(rows.map(x=>x.person_id),ids);
  assert.ok(rows.every(x=>x.promotion_id===promotion&&x.status==="SIGNED"
   &&x.start_week_index===27&&x.expiry===52&&Number(x.appearance_fee)>0));
  const twice=await withWorldTransaction(db.pool,tx=>recruitStrategicAiRosters(tx,world,1,27));
  assert.deepEqual(twice,{eligible:0,signed:0});
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_contracts",
    "ppw_world_legend_unlocks","ppw_legend_processed_weeks",
    "ppw_world_news_weeks","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
