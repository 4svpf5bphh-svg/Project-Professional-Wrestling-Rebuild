import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {applyHumanPromotionRestructure,previewHumanPromotionRestructure}
 from "../src/db/human-promotion-restructuring.js";
import {readBusinessWorkspace} from "../src/db/business-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("two human managers: only the owner can approve reviewed company rescue with real talent consequences",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),world="human-rescue-"+suffix,
  pA="a-"+suffix,pB="b-"+suffix,owner="owner-"+suffix,rival="rival-"+suffix;
 const db=postgresPool(url!,3);
 const scope={worldId:world,promotionId:pA,playerId:owner};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Human business rescue",seed:88,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:pA,name:"Territory A",tier:"LOCAL"});
   await addPromotion(tx,world,{id:pB,name:"Territory B",tier:"LOCAL"});
   await tx.query(`UPDATE ppw_worlds SET
    next_lock_at=clock_timestamp()+interval '3 hours',phase='OPEN'
    WHERE world_id=$1`,[world]);
   await tx.query(`UPDATE ppw_promotions SET
    cash=1000000,weekly_fixed_overhead=10000,
    weekly_media_income=0,weekly_sponsor_income=0,
    financial_distress='DISTRESSED',event_cadence_weeks=1,
    media_reach=40
    WHERE world_id=$1`,[world]);
   await tx.query(`
    INSERT INTO ppw_promotion_survival(world_id,promotion_id,
     baseline_weekly_fixed_overhead,baseline_event_cadence_weeks,
     stress_weeks,crisis_weeks,understaffed_weeks,healthy_weeks)
    VALUES($1,$2,10000,1,8,0,0,0)`,[world,pA]);
   for(const [id,promo] of [[owner,pA],[rival,pB]]){
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[id]);
    await tx.query(`
     INSERT INTO ppw_memberships(world_id,player_id,status)
     VALUES($1,$2,'ACTIVE')`,[world,id]);
    await tx.query(`
     INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)
     VALUES($1,$2,$3)`,[world,id,promo]);
   }
   const people=Array.from({length:9},(_,i)=>({
    id:"worker-"+i,employer:i===8?pB:pA,
    guarantee:i===0?5000:i===1?4000:100}));
   await tx.query(`
    INSERT INTO ppw_people(world_id,person_id,name,status)
    SELECT $1,x.id,x.id,'ACTIVE'
    FROM jsonb_to_recordset($2::jsonb) x(id text)`,
    [world,JSON.stringify(people)]);
   await tx.query(`
    INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
     family,status,start_week_index,expires_week_index,weekly_guarantee,
     remaining_dates,appearance_fee)
    SELECT $1,'deal-'||x.id,x.id,x.employer,'EXCLUSIVE','SIGNED',
     0,52,x.guarantee,NULL,0
    FROM jsonb_to_recordset($2::jsonb) x(id text,employer text,guarantee bigint)`,
    [world,JSON.stringify(people)]);
   await tx.query(`
    INSERT INTO ppw_contract_offers(world_id,offer_id,person_id,
     promotion_id,submitted_week_index,status,terms)
    VALUES($1,'pending','worker-8',$2,0,'PENDING','{}'::jsonb)`,[world,pA]);
  });
  await assert.rejects(previewHumanPromotionRestructure(db.pool,{
   ...scope,playerId:rival}),/Only the active booker/);
  const plan=await previewHumanPromotionRestructure(db.pool,scope);
  assert.ok(plan,"Sustained distress must produce an actionable recovery plan");
  assert.equal(plan.worldRevision,0);
  assert.equal(plan.stressWeeks,8);
  assert.equal(plan.minimumViableRoster,6);
  assert.equal(plan.newOverhead,8400);
  assert.equal(plan.newCadence,2);
  assert.deepEqual(plan.releases.map(x=>x.personId),["worker-0","worker-1"]);
  assert.deepEqual(plan.releases.map(x=>x.settlement),[10000,8000]);
  const input={...scope,requestId:"approved-"+suffix,expectedRevision:0};
  await assert.rejects(applyHumanPromotionRestructure(db.pool,{
   ...input,playerId:rival}),/Only the active booker/);
  const accepted=await applyHumanPromotionRestructure(db.pool,input);
  assert.equal(accepted.status,"APPLIED");
  assert.equal(accepted.result.releasedContracts,2);
  assert.equal(accepted.result.withdrawnOffers,1);
  assert.equal(accepted.result.settlement,18000);
  assert.equal((await applyHumanPromotionRestructure(db.pool,input)).status,"REPLAYED");
  assert.equal((await applyHumanPromotionRestructure(db.pool,{
   ...input,requestId:"stale-"+suffix})).status,"STALE");
  assert.equal(await previewHumanPromotionRestructure(db.pool,scope),null,
   "Restructuring has a real 12-week cooldown");
  const rows=await withWorldTransaction(db.pool,async tx=>{
   const companies=await tx.query<{promotion_id:string;cash:string;
    weekly_fixed_overhead:string;event_cadence_weeks:number}>(`
    SELECT promotion_id,cash,weekly_fixed_overhead,event_cadence_weeks
    FROM ppw_promotions WHERE world_id=$1 ORDER BY promotion_id`,[world]);
   const talent=await tx.query<{person_id:string;status:string}>(`
    SELECT person_id,status FROM ppw_contracts
    WHERE world_id=$1 ORDER BY person_id`,[world]);
   const controls=await tx.query<{promotion_id:string;player_id:string}>(`
    SELECT promotion_id,player_id FROM ppw_promotion_controls
    WHERE world_id=$1 AND active ORDER BY promotion_id`,[world]);
   const offered=await tx.query<{status:string}>(`
    SELECT status FROM ppw_contract_offers
    WHERE world_id=$1 AND offer_id='pending'`,[world]);
   const survival=await tx.query<{restructuring_count:number;
    last_restructure_week_index:number|null}>(`
    SELECT restructuring_count,last_restructure_week_index
    FROM ppw_promotion_survival
    WHERE world_id=$1 AND promotion_id=$2`,[world,pA]);
   return {companies,talent,controls,offered,survival};
  });
  assert.equal(rows.companies.find(p=>p.promotion_id===pA)!.cash,"982000");
  assert.equal(Number(rows.companies.find(p=>p.promotion_id===pA)!.weekly_fixed_overhead),8400);
  assert.equal(rows.companies.find(p=>p.promotion_id===pB)!.cash,"1000000");
  assert.equal(rows.talent.filter(c=>c.status==="TERMINATED").length,2);
  assert.equal(rows.talent.find(c=>c.person_id==="worker-8")!.status,"SIGNED");
  assert.equal(rows.controls.length,2);
  assert.equal(new Set(rows.controls.map(c=>c.player_id)).size,2);
  assert.equal(rows.offered[0]!.status,"WITHDRAWN");
  assert.equal(rows.survival[0]!.restructuring_count,1);
  const desk=await readBusinessWorkspace(db.pool,scope);
  assert.equal(desk.weeklyFixedOverhead,8400);
  assert.ok(desk.rollingFourWeeks.byCategory.some(x=>
   x.category==="RESTRUCTURING_SETTLEMENT"&&x.amount===-18000),
   "Financial desk shows actual signed release settlement");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_promotion_survival",
    "ppw_promotion_talent_trust","ppw_contract_offers",
    "ppw_command_receipts","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[owner,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
