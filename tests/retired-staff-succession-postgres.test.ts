
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {publishRetiredStaffCandidates} from "../src/db/retired-staff-succession.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {hireWorldStaff} from "../src/db/staff-employment.js";

const url=process.env.PPW_NEON_TEST_URL;
test("certified retired wrestler becomes a single contested World staff identity; a celebrity without bouts does not",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),world="alumni-"+suffix,
  playerA="alumni-owner-"+suffix,playerB="alumni-rival-"+suffix;
 const db=postgresPool(url!,3);
 const scope=(playerId:string,promotionId:string)=>({worldId:world,playerId,promotionId});
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Shared alumni market",seed:41,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:"human-a",name:"Human A",tier:"LOCAL"});
   await addPromotion(tx,world,{id:"human-b",name:"Human B",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[playerA,playerB]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [world,playerA,playerB]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,'human-a',true),($1,$3,'human-b',true)",
    [world,playerA,playerB]);
   await tx.query("UPDATE ppw_promotions SET cash=1000000 WHERE world_id=$1",[world]);
   await tx.query([
    "INSERT INTO ppw_people(world_id,person_id,name,status,",
    "career_experience,in_ring_quality,match_craft,presentation,safety,popularity,recognition)",
    "VALUES ($1,'retired-veteran','Mara Bell','RETIRED',72,68,46,45,96,21,19),",
    "($1,'famous-without-bouts','Famous Without Bouts','RETIRED',98,99,99,99,99,100,100),",
    "($1,'working-roster','Working Roster','ACTIVE',40,60,60,60,70,50,50)"
   ].join(" "),[world]);
   await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,status,family,start_week_index,expires_week_index,weekly_guarantee) VALUES($1,'working-contract','working-roster','human-a','SIGNED','EXCLUSIVE',0,104,500)",[world]);
   // One honest completed show per week; no draft, unplayed angle or invented
   // appearance can count. The contender's losing opponent isn't important.
   await tx.query([
    "INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)",
    "SELECT $1,'alumni-show-'||n,'human-a',1,n,'SUBMITTED'",
    "FROM generate_series(1,14) n"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,",
    "resolution_id,crowd_response,receipt_json,receipt_digest)",
    "SELECT $1,'human-a','alumni-show-'||n,1,n,'res-alumni-'||n,65,",
    "'{}'::jsonb,repeat('a',64) FROM generate_series(1,14) n"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,position,",
    "crowd_response,actual_finish,actual_winner_side)",
    "SELECT $1,'alumni-show-'||n,'match-1',0,65,'CLEAN_PIN','A'",
    "FROM generate_series(1,14) n"
   ].join(" "),[world]);
   await tx.query([
    "INSERT INTO ppw_individual_field_career_effects(world_id,show_id,match_id,",
    "person_id,actual_winner_side,performer_side,won,before_stats,after_stats)",
    "SELECT $1,'alumni-show-'||n,'match-1','retired-veteran',",
    "'A','A',true,'{}'::jsonb,'{}'::jsonb FROM generate_series(1,14) n"
   ].join(" "),[world]);
   // A genuine booked but losing member of the current promotion roster.
   await tx.query([
    "INSERT INTO ppw_individual_field_career_effects(world_id,show_id,match_id,",
    "person_id,actual_winner_side,performer_side,won,before_stats,after_stats)",
    "SELECT $1,'alumni-show-'||n,'match-1','working-roster',",
    "'A','B',false,'{}'::jsonb,'{}'::jsonb FROM generate_series(1,14) n"
   ].join(" "),[world]);
   await tx.query("UPDATE ppw_worlds SET week=15 WHERE world_id=$1",[world]);
   assert.equal(await publishRetiredStaffCandidates(tx,world,
    ["retired-veteran","famous-without-bouts"],20),1);
   assert.equal(await publishRetiredStaffCandidates(tx,world,
    ["retired-veteran","famous-without-bouts"],20),0);
  });
  const a=await readStaffWorkspace(db.pool,scope(playerA,"human-a"));
  const b=await readStaffWorkspace(db.pool,scope(playerB,"human-b"));
  assert.equal(a.meetings.length,8);
  assert.equal(b.meetings.length,8);
  assert.equal(a.ownerRankings.length,1);
  assert.deepEqual({name:a.ownerRankings[0]!.name,matches:a.ownerRankings[0]!.matches,
   wins:a.ownerRankings[0]!.wins},
   {name:"Working Roster",matches:14,wins:0});
  assert.equal(b.ownerRankings.length,0,"No rival match evidence should leak");
  const alumnus=a.market.find(e=>e.formerWrestlerId==="retired-veteran");
  assert.ok(alumnus);
  assert.equal(alumnus.name,"Mara Bell");
  assert.equal(alumnus.role,"TRAINER");
  assert.ok(alumnus.careerNote?.includes("14 certified matches"));
  assert.equal(b.market.filter(e=>e.staffId===alumnus.staffId).length,1);
  assert.ok(!a.market.some(e=>e.formerWrestlerId==="famous-without-bouts"));
  const hire=await hireWorldStaff(db.pool,{...scope(playerA,"human-a"),
   staffId:alumnus.staffId,weeklySalary:alumnus.weeklySalary,termWeeks:52,
   requestId:"alumni-hire",expectedRevision:0});
  assert.equal(hire.status,"APPLIED");
  if(hire.status!=="APPLIED")throw Error("Expected World alumni offer to apply");
  assert.equal(hire.result.accepted,true);
  const office=await readStaffWorkspace(db.pool,scope(playerA,"human-a"));
  assert.equal(office.employees.find(e=>e.staffId===alumnus.staffId)?.name,"Mara Bell");
  await assert.rejects(hireWorldStaff(db.pool,{...scope(playerB,"human-b"),
   staffId:alumnus.staffId,weeklySalary:alumnus.weeklySalary,termWeeks:52,
   requestId:"alumni-rival",expectedRevision:1}),/already employed/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_individual_field_career_effects","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_booking_drafts","ppw_staff_employments",
    "ppw_staff_alumni","ppw_ledger_events","ppw_command_receipts",
    "ppw_promotion_controls","ppw_memberships","ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerA,playerB]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
