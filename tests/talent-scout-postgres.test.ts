import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {worldStaff} from "../src/domain/world-staff.js";
import {hireWorldStaff} from "../src/db/staff-employment.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";

const url=process.env.PPW_NEON_TEST_URL;
test("hired Scout recommends only unsigned prospects in a private bounded three-read Staff desk",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="scouting-"+id,promotion="owned-"+id,
  otherPromotion="rival-"+id,player="booker-"+id,rival="other-"+id,seed=58;
 const db=postgresPool(url!,3);
 const scout=worldStaff(seed).find(x=>x.role==="SCOUT"&&x.specialism==="technical upside")!;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Scout fixture",seed,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Our Promotion",tier:"LOCAL"});
   await addPromotion(tx,world,{id:otherPromotion,name:"Rival",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,rival]);
   await tx.query(`INSERT INTO ppw_memberships(world_id,player_id,status)
     VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')`,[world,player,rival]);
   await tx.query(`INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active)
     VALUES($1,$2,$3,true),($1,$4,$5,true)`,
    [world,player,promotion,rival,otherPromotion]);
   await tx.query("UPDATE ppw_promotions SET cash=1000000 WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,status,career_stage,
     development_aptitude,in_ring_quality,match_craft,presentation,popularity)
    VALUES ($1,'young-technical','Rising Technician','ACTIVE','PROSPECT',89,87,93,48,12),
     ($1,'young-character','Young Charmer','ACTIVE','PROSPECT',85,40,43,91,18),
     ($1,'signed-prospect','Signed Star','ACTIVE','PROSPECT',99,99,99,99,100),
     ($1,'senior-star','Veteran Star','ACTIVE','VETERAN',99,99,99,99,100)`,[world]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,
     promotion_id,family,status,remaining_dates,expires_week_index)
    VALUES($1,'signed-offer','signed-prospect',$2,'EXCLUSIVE','SIGNED',20,51)`,
    [world,otherPromotion]);
  });
  const before=await readStaffWorkspace(db.pool,{worldId:world,promotionId:promotion,playerId:player});
  assert.deepEqual(before.scoutReport,[]);
  const hire=await hireWorldStaff(db.pool,{worldId:world,promotionId:promotion,
   playerId:player,staffId:scout.staffId,weeklySalary:scout.weeklySalary,
   termWeeks:52,requestId:"hire-scout",expectedRevision:0});
  assert.equal(hire.status,"APPLIED");
  if(hire.status!=="APPLIED")throw Error("Scout hire rejected");
  assert.equal(hire.result.accepted,true);
  const meter=new MeasuredQuerySession("private-scout-office");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const office=await readStaffWorkspace(measured,{worldId:world,promotionId:promotion,playerId:player});
  assert.equal(office.employees.find(e=>e.role==="SCOUT")?.staffId,scout.staffId);
  assert.equal(office.weeklyPayroll,scout.weeklySalary);
  assert.equal(office.scoutReport.length,2);
  assert.ok(office.scoutReport.some(x=>x.personId==="young-technical"));
  assert.ok(office.scoutReport.some(x=>x.personId==="young-character"));
  assert.ok(!office.scoutReport.some(x=>x.personId==="signed-prospect"||x.personId==="senior-star"));
  assert.ok(office.meetings.some(x=>x.role==="SCOUT"&&x.staffName===scout.name));
  assert.ok(office.notices.some(n=>n.target==="market"&&n.message.includes("Rising Technician")));
  assert.ok(meter.assertBudget({maxQueries:3,maxResultBytes:10000}).queryCount<=3);
  await assert.rejects(readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:rival}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_staff_employments",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships","ppw_contracts",
    "ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,rival]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
