import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readStableWorkspace,createStable,addStableMember,removeStableMember,disbandStable}
 from "../src/db/stable-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("original PPW stable formation, ownership, roster limits, historic joins, disband and replay",
 {skip:!url?"No disposable PostgreSQL configured":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID();
 const worldId="stables-"+id,promotionId="promotion-"+id,playerId="owner-"+id;
 const otherId="rival-"+id;
 const people=Array.from({length:5},(_,i)=>"member-"+i+"-"+id);
 const scope={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Stable integration",seed:9,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Player fed",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:otherId,name:"Other fed",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   for(let i=0;i<people.length;i++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [worldId,people[i]!,"Wrestler "+i]);
    if(i<4)await tx.query(
     "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"deal-"+i+"-"+id,people[i]!,promotionId]);
   }
  });
  let view=await readStableWorkspace(db.pool,scope);
  assert.deepEqual(view.stables,[]);
  assert.equal(view.roster.length,4);
  await assert.rejects(createStable(db.pool,{...scope,requestId:"unrostered",
   expectedRevision:0,name:"Foreign",personIds:[people[0]!,people[1]!,people[4]!]}),
   /current roster/);
  assert.equal((await readStableWorkspace(db.pool,scope)).worldRevision,0);
  const create=await createStable(db.pool,{...scope,requestId:"form-1",
   expectedRevision:0,name:"The Alliance",
   personIds:people.slice(0,3)});
  assert.equal(create.status,"APPLIED");
  if(create.status!=="APPLIED")throw Error("Unexpected creation result");
  const stableId=create.result.stableId;
  const replay=await createStable(db.pool,{...scope,requestId:"form-1",
   expectedRevision:0,name:"The Alliance",personIds:people.slice(0,3)});
  assert.equal(replay.status,"REPLAYED");
  if(replay.status==="REPLAYED")assert.equal(replay.result.stableId,stableId);
  await assert.rejects(createStable(db.pool,{...scope,requestId:"duplicate-name",
   expectedRevision:1,name:" THE ALLIANCE ",personIds:people.slice(0,3)}));
  await assert.rejects(createStable(db.pool,{...scope,requestId:"double",
   expectedRevision:1,name:"Second Stable",personIds:people.slice(1,4)}));
  assert.equal((await readStableWorkspace(db.pool,scope)).worldRevision,1);
  const add=await addStableMember(db.pool,{...scope,requestId:"join",expectedRevision:1,
   stableId,personId:people[3]!});
  assert.equal(add.status,"APPLIED");
  view=await readStableWorkspace(db.pool,scope);
  assert.equal(view.stables[0]!.currentMembers.length,4);
  assert.equal(view.roster.find(p=>p.personId===people[3])?.stableId,stableId);
  const remove=await removeStableMember(db.pool,{...scope,requestId:"exit",
   expectedRevision:2,stableId,personId:people[1]!});
  assert.equal(remove.status,"APPLIED");
  view=await readStableWorkspace(db.pool,scope);
  assert.equal(view.stables[0]!.currentMembers.length,3);
  assert.equal(view.stables[0]!.memberHistory.find(p=>p.personId===people[1])?.active,false);
  // HTTP-shaped RPC still obtains actor identity exclusively from the verified session.
  const ctx={pool:db.pool,actor:{playerId}};
  const rpc=await dispatchCardRpc(ctx,"addStableMember",{
   worldId,promotionId,showId:"not-used",requestId:"rejoin",expectedRevision:3,
   stableId,personId:people[1]!,playerId:"forged-controller"});
  assert.equal((rpc as {status:string}).status,"APPLIED");
  view=await readStableWorkspace(db.pool,scope);
  assert.equal(view.stables[0]!.memberHistory.filter(x=>x.personId===people[1]).length,2);
  await assert.rejects(readStableWorkspace(db.pool,{...scope,playerId:"intruder"}),
   /access denied/);
  await assert.rejects(disbandStable(db.pool,{...scope,playerId:"intruder",
   requestId:"bad",expectedRevision:4,stableId}),/access denied/);
  const disband=await disbandStable(db.pool,{...scope,requestId:"disband",
   expectedRevision:4,stableId});
  assert.equal(disband.status,"APPLIED");
  assert.equal((await disbandStable(db.pool,{...scope,requestId:"disband",
   expectedRevision:4,stableId})).status,"REPLAYED");
  view=await readStableWorkspace(db.pool,scope);
  assert.equal(view.stables[0]!.status,"DISBANDED");
  assert.equal(view.stables[0]!.currentMembers.length,0);
  assert.ok(view.stables[0]!.memberHistory.every(x=>!x.active&&x.leftWeekIndex===0));
  assert.ok(view.roster.every(x=>x.stableId===null));
  const after=await createStable(db.pool,{...scope,requestId:"new-faction",
   expectedRevision:5,name:"The Alliance",personIds:people.slice(0,3)});
  assert.equal(after.status,"APPLIED","Disbanded names and wrestlers can be reused");
  const events=await withWorldTransaction(db.pool,tx=>tx.query<{event_type:string}>(
   "SELECT event_type FROM ppw_ledger_events WHERE world_id=$1 AND event_type LIKE 'STABLE_%'",
   [worldId]));
  assert.equal(events.length,6);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_command_receipts",
    "ppw_stable_memberships","ppw_stables","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
