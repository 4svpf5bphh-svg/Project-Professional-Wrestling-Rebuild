import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {recruitDistressedAiRosters,recruitStrategicAiRosters,
 strategicTalentFit} from "../src/db/living-world-promotions.js";
const url=process.env.PPW_NEON_TEST_URL;
test("distressed AI rescues its roster with two cheap deterministic prospects but never touches human control",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="recruits-"+randomUUID(),db=postgresPool(url!,3),
  human="human-"+randomUUID();
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Recruitment fixture",seed:237,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"ai",name:"Underfunded AI",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"human",name:"Human promotion",tier:"LOCAL"});
   await tx.query(`UPDATE ppw_promotions SET
    management_mode=CASE WHEN promotion_id='ai' THEN 'AI' ELSE 'HUMAN' END,
    financial_distress='CRISIS',cash=0,event_cadence_weeks=3,
    weekly_fixed_overhead=1000 WHERE world_id=$1`,[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[human]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE')`,[world,human]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'human')`,[world,human]);
   const people=Array.from({length:20},(_,i)=>({id:"free-"+i}));
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
     recognition,popularity,in_ring_quality,match_craft,presentation,
     contract_priorities)
    SELECT $1,x.id,x.id,'ACTIVE','PROSPECT',20,20,35,40,45,
     '{"money":10,"role":100,"prestige":30,"schedule":40,"loyalty":40,"exposure":100}'::jsonb
    FROM jsonb_to_recordset($2::jsonb) x(id text)`,[world,JSON.stringify(people)]);
  });
  const result=await withWorldTransaction(db.pool,tx=>recruitDistressedAiRosters(
   tx,world,1,1));
  assert.deepEqual(result,{eligible:1,signed:2});
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{
   contract_id:string;promotion_id:string;person_id:string;status:string;
   family:string;remaining_dates:number;date_entitlement:number;
   start_week_index:number;expires_week_index:number;
   weekly_guarantee:string;appearance_fee:string;role_expectation:string
  }>(`SELECT contract_id,promotion_id,person_id,status,family,
   remaining_dates,date_entitlement,start_week_index,expires_week_index,
   weekly_guarantee,appearance_fee,role_expectation
   FROM ppw_contracts WHERE world_id=$1 ORDER BY contract_id`,[world]));
  assert.equal(rows.length,2);
  assert.ok(rows.every(r=>r.promotion_id==="ai"&&r.status==="SIGNED"));
  assert.ok(rows.every(r=>r.family==="LIMITED_NON_EXCLUSIVE"&&r.remaining_dates===5
   &&r.date_entitlement===5&&r.start_week_index===0&&r.expires_week_index===12
   &&r.role_expectation==="DEVELOPMENTAL"));
  assert.equal(new Set(rows.map(r=>r.person_id)).size,2);
  assert.ok(rows.every(r=>Number(r.weekly_guarantee)>0&&Number(r.appearance_fee)>0));
  const humanState=await withWorldTransaction(db.pool,tx=>tx.query<{
   player_id:string;promotion_id:string;active:boolean
  }>(`SELECT player_id,promotion_id,active FROM ppw_promotion_controls
    WHERE world_id=$1`,[world]));
  assert.equal(humanState.length,1);
  assert.equal(humanState[0]!.player_id,human);
  assert.equal(humanState[0]!.promotion_id,"human");
  assert.equal(humanState[0]!.active,true);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_promotion_talent_trust",
    "ppw_promotion_survival","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[human]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("the AI prospect shortlist responds to its actual creative philosophy",()=>{
 const base={person_id:"p",career_stage:"PROSPECT" as const,
  recognition:20,popularity:30,match_craft:92,in_ring_quality:95,
  presentation:38,contract_priorities:{money:15,role:80,exposure:90,
   prestige:30,schedule:50,loyalty:50}};
 const showman={...base,in_ring_quality:38,match_craft:42,
  presentation:97,popularity:62,recognition:70};
 assert.ok(strategicTalentFit(base,"WORKRATE")>strategicTalentFit(showman,"WORKRATE"));
 assert.ok(strategicTalentFit(showman,"STAR_POWER")>strategicTalentFit(base,"STAR_POWER"));
});
test("solvent AI may hire one affordable unattached prospect per quarter, never a human-controlled company",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="growth-recruit-"+randomUUID(),db=postgresPool(url!,3),
  human="owner-"+randomUUID();
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Seasonal scouting",seed:642,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"ai",name:"Workrate AI",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"human",name:"Player-owned",tier:"LOCAL"});
   await tx.query(`UPDATE ppw_promotions SET
    management_mode=CASE WHEN promotion_id='ai' THEN 'AI' ELSE 'HUMAN' END,
    financial_distress='HEALTHY',cash=500000,
    weekly_fixed_overhead=1000,weekly_media_income=30000,
    weekly_sponsor_income=5000,last_weekly_net=12000,
    ai_risk_tolerance=20,ai_match_quality_preference=95,ai_star_preference=40
    WHERE world_id=$1`,[world]);
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[human]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
    VALUES($1,$2,'ACTIVE')`,[world,human]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
    VALUES($1,$2,'human')`,[world,human]);
   const people=Array.from({length:32},(_,i)=>({id:"unsigned-"+i}));
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,
    career_stage,recognition,popularity,in_ring_quality,match_craft,presentation,
    contract_priorities)
    SELECT $1,x.id,x.id,'ACTIVE','PROSPECT',25,27,88,91,55,
     '{"money":10,"role":100,"prestige":30,"schedule":50,"loyalty":50,"exposure":100}'::jsonb
    FROM jsonb_to_recordset($2::jsonb) x(id text)`,
    [world,JSON.stringify(people)]);
  });
  const early=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,13));
  assert.deepEqual(early,{eligible:0,signed:0});
  const first=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,14));
  assert.deepEqual(first,{eligible:1,signed:1});
  const repeat=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,14));
  assert.deepEqual(repeat,{eligible:0,signed:0},
   "one signing per promotion per quarter is idempotent");
  const signed=await withWorldTransaction(db.pool,tx=>tx.query<{
   contract_id:string;promotion_id:string;person_id:string;start_week_index:number;
   expires_week_index:number;remaining_dates:number;weekly_guarantee:string
  }>(`SELECT contract_id,promotion_id,person_id,start_week_index,
   expires_week_index,remaining_dates,weekly_guarantee
   FROM ppw_contracts WHERE world_id=$1`,[world]));
  assert.equal(signed.length,1);
  assert.equal(signed[0]!.promotion_id,"ai");
  assert.equal(signed[0]!.start_week_index,14);
  assert.equal(signed[0]!.expires_week_index,39);
  assert.equal(signed[0]!.remaining_dates,8);
  assert.ok(Number(signed[0]!.weekly_guarantee)<5000);
  assert.ok(signed[0]!.contract_id.startsWith("strategic:13:ai:"));
  const skip=await withWorldTransaction(db.pool,tx=>
   recruitStrategicAiRosters(tx,world,1,15));
  assert.deepEqual(skip,{eligible:0,signed:0});
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_promotion_talent_trust",
    "ppw_promotion_survival","ppw_contracts","ppw_promotion_controls",
    "ppw_memberships","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[human]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
