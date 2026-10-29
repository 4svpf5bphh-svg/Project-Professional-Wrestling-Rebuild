import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {createTrio,readTagTeamWorkspace} from "../src/db/tag-team-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";

const url=process.env.PPW_NEON_TEST_URL;
test("named trios require exactly three roster members and survive replay without fake tag history",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),worldId="trios-"+suffix;
 const promotionId="main",playerId="owner-"+suffix;
 const people=["a","b","c","d"].map(id=>"person-"+id+"-"+suffix);
 const db=postgresPool(url!,3);
 const base={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Trios World",seed:5,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Main Wrestling",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   for(const [index,personId] of people.entries()){
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name,booking_division)
     VALUES($1,$2,$3,$4)`,[worldId,personId,"Person "+index,index===3?"WOMEN":"MEN"]);
    await tx.query(`INSERT INTO ppw_contracts(
     world_id,contract_id,person_id,promotion_id,family,status,
     remaining_dates,expires_week_index)
     VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)`,
     [worldId,"contract-"+index,personId,promotionId]);
   }
  });
  const before=await readTagTeamWorkspace(db.pool,base);
  assert.deepEqual(before.trios,[]);assert.deepEqual(before.teams,[]);
  assert.equal(before.worldRevision,0);
  const input={...base,requestId:"form",expectedRevision:0,
   name:"The Three Musketeers",personIds:people.slice(0,3)};
  await assert.rejects(createTrio(db.pool,{...input,personIds:people.slice(0,2)}),
   /three different wrestlers/);
  await assert.rejects(createTrio(db.pool,{...input,
   personIds:[people[0]!,people[1]!,people[3]!]}),/same division/);
  assert.equal((await readTagTeamWorkspace(db.pool,base)).worldRevision,0);
  const created=await createTrio(db.pool,input);
  assert.equal(created.status,"APPLIED");
  assert.equal((await createTrio(db.pool,input)).status,"REPLAYED");
  const after=await readTagTeamWorkspace(db.pool,base);
  assert.equal(after.worldRevision,1);
  assert.deepEqual(after.teams,[]);
  assert.equal(after.trios.length,1);
  assert.equal(after.trios[0]?.name,"The Three Musketeers");
  assert.deepEqual(after.trios[0]?.members.map(x=>x.personId).sort(),
   people.slice(0,3).sort());
  await assert.rejects(createTrio(db.pool,{...input,requestId:"duplicate",
   expectedRevision:1}),/already has an active/);
  await assert.rejects(readTagTeamWorkspace(db.pool,{...base,playerId:"intruder"}),
   /access denied/);
  const rpc=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "tagTeams",{...base,playerId:"spoofed"});
  assert.equal((rpc as {trios:unknown[]}).trios.length,1);
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "createTrio",{...base,requestId:"bad",expectedRevision:1,name:"Bad",
    personIds:[people[0]!,people[1]!]}),/Invalid trio members/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_command_receipts",
    "ppw_trio_members","ppw_trios","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});