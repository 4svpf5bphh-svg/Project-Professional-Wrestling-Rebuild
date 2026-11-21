import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {worldStaff} from "../src/domain/world-staff.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("hired Creative and Commentary discuss Undertaker's solo story without inventing Side B",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),world="staff-solo-"+suffix,
  promotion="solo-promotion-"+suffix,player="solo-owner-"+suffix,
  taker="undertaker-"+suffix,programme="character-story-"+suffix;
 const db=postgresPool(url!,3);
 const crew=worldStaff(124);
 const creative=crew.find(x=>x.role==="CREATIVE")!;
 const commentator=crew.find(x=>x.role==="COMMENTATOR")!;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Solo Story Team",seed:124,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"CWA",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) "+
    "VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) "+
    "VALUES($1,$2,$3,true)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,'The Undertaker')",
    [world,taker]);
   await tx.query("INSERT INTO ppw_programmes"+
    "(world_id,promotion_id,programme_id,status,programme_format,repetition,heat,started_week_index)"+
    " VALUES($1,$2,$3,'ACTIVE','SOLO',0,61,0)",[world,promotion,programme]);
   await tx.query("INSERT INTO ppw_programme_side_refs"+
    "(world_id,promotion_id,programme_id,side,position,ref_kind,ref_id)"+
    " VALUES($1,$2,$3,'A',0,'PERSON',$4)",[world,promotion,programme,taker]);
   for(const [index,staff] of [creative,commentator].entries())
    await tx.query("INSERT INTO ppw_staff_employments"+
     "(world_id,employment_id,staff_id,promotion_id,role,status,weekly_salary,"+
     "start_week_index,expires_week_index,term_weeks,morale)"+
     " VALUES($1,$2,$3,$4,$5,'ACTIVE',500,0,51,52,70)",
     [world,"hire-"+index+"-"+suffix,staff.staffId,promotion,staff.role]);
  });
  const desk=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:player});
  const creativeAdvice=desk.meetings.find(x=>x.role==="CREATIVE")!;
  const commentatorAdvice=desk.meetings.find(x=>x.role==="COMMENTATOR")!;
  assert.ok(creativeAdvice.staffName);
  assert.ok(commentatorAdvice.staffName);
  assert.match(creativeAdvice.message,/The Undertaker.*solo character story/);
  assert.match(commentatorAdvice.message,/The Undertaker.*solo character story/);
  assert.match(creativeAdvice.message,/No completed on-air chapter/);
  assert.doesNotMatch(JSON.stringify([creativeAdvice,commentatorAdvice]),
   /Side B|unassigned opponent|Undertaker vs/i);
  assert.equal(desk.meetings.length,9,"Vacancies still retain genuine house cover");
  assert.equal(desk.meetings.filter(x=>x.priority==="VACANT").length,7);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_staff_employments","ppw_programme_side_refs",
    "ppw_programmes","ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
