import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {worldStaff} from "../src/domain/world-staff.js";
import {hireWorldStaff,releaseWorldStaff,renewWorldStaff}
 from "../src/db/staff-employment.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;

test("One unique shared staff employee; 52/104-week contracts; buyout is exact, private and once-only",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="staff-office-"+id,
  manager="manager-"+id,rival="rival-"+id,
  promotion="owner-"+id,other="other-"+id;
 const db=postgresPool(url!,3),seed=35;
 const agent=worldStaff(seed).find(s=>s.role==="ROAD_AGENT")!;
 const offer={worldId:world,promotionId:promotion,playerId:manager,
  staffId:agent.staffId,weeklySalary:agent.weeklySalary,termWeeks:52 as const};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Shared staff office",seed,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Owner",tier:"LOCAL"});
   await addPromotion(tx,world,{id:other,name:"Rival",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[manager,rival]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [world,manager,rival]);
   await tx.query(`
    INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active)
    VALUES($1,$2,$3,true),($1,$4,$5,true)`,[world,manager,promotion,rival,other]);
   await tx.query("UPDATE ppw_promotions SET cash=1000000 WHERE world_id=$1",[world]);
  });
  const first=await hireWorldStaff(db.pool,{...offer,
   requestId:"hire-agent",expectedRevision:0});
  assert.equal(first.status,"APPLIED");
  if(first.status!=="APPLIED"||!first.result.accepted)throw Error("Hire unexpectedly rejected");
  const employment=first.result.employmentId!;
  const replay=await hireWorldStaff(db.pool,{...offer,
   requestId:"hire-agent",expectedRevision:0});
  assert.equal(replay.status,"REPLAYED");
  await assert.rejects(hireWorldStaff(db.pool,{...offer,promotionId:other,
   playerId:rival,requestId:"rival-attempt",expectedRevision:1}),/employed/);
  const office=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:manager});
  assert.equal(office.employees.length,1);
  assert.equal(office.employees[0]!.role,"ROAD_AGENT");
  assert.equal(office.employees[0]!.weeksRemaining,52);
  assert.equal(office.weeklyPayroll,agent.weeklySalary);
  assert.equal(office.employees[0]!.buyoutCost,52*agent.weeklySalary);
  assert.equal(office.market.some(s=>s.staffId===agent.staffId),false);
  await assert.rejects(readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:rival}),/access denied/);
  await assert.rejects(releaseWorldStaff(db.pool,{
   worldId:world,promotionId:promotion,playerId:rival,employmentId:employment,
   requestId:"unauthorized",expectedRevision:1}),/your active promotion/);
  const ended=await releaseWorldStaff(db.pool,{
   worldId:world,promotionId:promotion,playerId:manager,employmentId:employment,
   requestId:"release",expectedRevision:1});
  assert.equal(ended.status,"APPLIED");
  if(ended.status!=="APPLIED")throw Error("Staff release was not applied");
  assert.equal(ended.result.buyoutCost,52*agent.weeklySalary);
  assert.equal(ended.result.remainingCash,1000000-52*agent.weeklySalary);
  assert.equal((await releaseWorldStaff(db.pool,{
   worldId:world,promotionId:promotion,playerId:manager,employmentId:employment,
   requestId:"release",expectedRevision:1})).status,"REPLAYED");
  const aftermath=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:manager});
  assert.equal(aftermath.weeklyPayroll,0);
  assert.equal(aftermath.employees.length,0);
  const financials=await withWorldTransaction(db.pool,tx=>
   tx.query<{cash:string;status:string;buyouts:number;paid:string}>(`
    SELECT p.cash::text,e.status,
     (SELECT count(*)::integer FROM ppw_ledger_events l
       WHERE l.world_id=$1 AND l.event_type='STAFF_BUYOUT') AS buyouts,
     (SELECT coalesce(sum((payload->>'amount')::bigint),0)::text
       FROM ppw_ledger_events l WHERE l.world_id=$1
        AND l.event_type='STAFF_BUYOUT') AS paid
    FROM ppw_promotions p JOIN ppw_staff_employments e
     ON e.world_id=p.world_id AND e.promotion_id=p.promotion_id
    WHERE p.world_id=$1 AND p.promotion_id=$2`,[world,promotion]));
  assert.equal(Number(financials[0]!.cash),1000000-52*agent.weeklySalary);
  assert.equal(financials[0]!.status,"ENDED");
  assert.equal(financials[0]!.buyouts,1);
  assert.equal(Number(financials[0]!.paid),52*agent.weeklySalary);
  // A rejected lowball offer has no employment or money movement.
  const rejected=await hireWorldStaff(db.pool,{...offer,
   weeklySalary:1,termWeeks:104,requestId:"cheap",expectedRevision:2});
  assert.equal(rejected.status,"APPLIED");
  if(rejected.status==="APPLIED")assert.equal(rejected.result.accepted,false);
  const renewed=await renewWorldStaff(db.pool,{
   worldId:world,promotionId:promotion,playerId:manager,
   employmentId:employment,weeklySalary:agent.weeklySalary,termWeeks:104,
   requestId:"no-longer-employee",expectedRevision:3
  }).then(()=>false,()=>true);
  assert.equal(renewed,true);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_staff_show_reports","ppw_ledger_events",
    "ppw_staff_continuity_settings","ppw_staff_employments",
    "ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[manager,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});

test("A two-year renewal replaces the remaining term and wage immediately, without extending it twice",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const unique=randomUUID(),world="renew-staff-"+unique,
  player="manager-"+unique,promotion="promotion-"+unique;
 const db=postgresPool(url!,3),seed=71;
 const agent=worldStaff(seed).find(s=>s.role==="CREATIVE")!;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Renewal accounting",seed,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Renewal Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",[world,player,promotion]);
   await tx.query("UPDATE ppw_promotions SET cash=1000000 WHERE world_id=$1 AND promotion_id=$2",[world,promotion]);
  });
  const hired=await hireWorldStaff(db.pool,{worldId:world,promotionId:promotion,
   playerId:player,staffId:agent.staffId,weeklySalary:agent.weeklySalary,termWeeks:52,
   requestId:"initial",expectedRevision:0});
  assert.equal(hired.status,"APPLIED");
  if(hired.status!=="APPLIED"||hired.result.accepted!==true||!hired.result.employmentId)
   throw Error("Expected accepted initial contract");
  const employmentId=hired.result.employmentId;
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET week=45 WHERE world_id=$1",[world]));
  const salary=agent.weeklySalary+125;
  const plan={worldId:world,promotionId:promotion,playerId:player,
   employmentId,weeklySalary:salary,termWeeks:104 as const,
   requestId:"renew",expectedRevision:1};
  const renewed=await renewWorldStaff(db.pool,plan);
  assert.equal(renewed.status,"APPLIED");
  if(renewed.status!=="APPLIED")throw Error("Staff renewal did not apply");
  assert.equal(renewed.result.accepted,true);
  assert.equal(renewed.result.expiresWeekIndex,147);
  assert.equal((await renewWorldStaff(db.pool,plan)).status,"REPLAYED");
  const office=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:player});
  assert.equal(office.employees.length,1);
  assert.equal(office.employees[0]!.weeksRemaining,104);
  assert.equal(office.employees[0]!.weeklySalary,salary);
  assert.equal(office.employees[0]!.buyoutCost,104*salary);
  assert.equal(office.weeklyPayroll,salary);
  const saved=await withWorldTransaction(db.pool,tx=>tx.query<{
   start_week_index:number;expires_week_index:number;term_weeks:number;weekly_salary:string
  }>("SELECT start_week_index,expires_week_index,term_weeks,weekly_salary::text FROM ppw_staff_employments WHERE world_id=$1 AND employment_id=$2",[world,employmentId]));
  assert.deepEqual(saved.map(e=>({start:e.start_week_index,end:e.expires_week_index,
   length:e.term_weeks,salary:Number(e.weekly_salary)})),
   [{start:0,end:147,length:104,salary}]);
  await assert.rejects(renewWorldStaff(db.pool,{
   ...plan,requestId:"double-renew",expectedRevision:2}),/final 13 weeks/);
  const released=await releaseWorldStaff(db.pool,{worldId:world,promotionId:promotion,
   playerId:player,employmentId,requestId:"release",expectedRevision:2});
  assert.equal(released.status,"APPLIED");
  if(released.status==="APPLIED")assert.equal(released.result.buyoutCost,104*salary);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_staff_show_reports","ppw_ledger_events",
    "ppw_staff_continuity_settings","ppw_staff_employments",
    "ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
