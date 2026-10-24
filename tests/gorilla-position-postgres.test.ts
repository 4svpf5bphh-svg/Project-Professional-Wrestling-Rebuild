import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {setGorillaPolicy} from "../src/db/gorilla-position.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Two-manager Gorilla policies are private, replay-safe, pre-lock only and scoped to promotion",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="gorilla-"+id;
 const owners=["gorilla-owner-"+id,"gorilla-rival-"+id];
 const promotions=["gorilla-promotion-"+id,"gorilla-other-"+id];
 const db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Gorilla Two Manager",seed:88,rulesetVersion:"test"});
   for(const promotion of promotions)
    await addPromotion(tx,world,{id:promotion,name:promotion,tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",owners);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [world,...owners]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true),($1,$4,$5,true)",
    [world,owners[0],promotions[0],owners[1],promotions[1]]);
  });
  const setup={worldId:world,promotionId:promotions[0]!,
   playerId:owners[0]!,requestId:"pre-show-approval",
   expectedRevision:0,policy:"FOLLOW_THE_CROWD" as const};
  const first=await setGorillaPolicy(db.pool,setup);
  assert.equal(first.status,"APPLIED");
  const again=await setGorillaPolicy(db.pool,setup);
  assert.equal(again.status,"REPLAYED");
  const office=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotions[0]!,playerId:owners[0]!});
  assert.equal(office.gorillaPolicy,"FOLLOW_THE_CROWD");
  const other=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotions[1]!,playerId:owners[1]!});
  assert.equal(other.gorillaPolicy,"STICK_TO_CARD");
  await assert.rejects(setGorillaPolicy(db.pool,{...setup,playerId:owners[1]!,
   requestId:"spoof-other-owner",expectedRevision:1}),/controller/);
  await assert.rejects(readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotions[0]!,playerId:owners[1]!}),/access denied/);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET phase='LOCKED' WHERE world_id=$1",[world]));
  await assert.rejects(setGorillaPolicy(db.pool,{...setup,
   requestId:"after-lock",expectedRevision:1}),/OPEN|open|deadline|booking/i);
  const own=await withWorldTransaction(db.pool,tx=>tx.query<{
   policy:string;owner_player_id:string}>(`
    SELECT policy,owner_player_id FROM ppw_gorilla_policies
    WHERE world_id=$1 AND promotion_id=$2`,[world,promotions[0]]));
  assert.deepEqual(own,[{policy:"FOLLOW_THE_CROWD",owner_player_id:owners[0]}]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_gorilla_show_logs","ppw_gorilla_policies",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[owners]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
