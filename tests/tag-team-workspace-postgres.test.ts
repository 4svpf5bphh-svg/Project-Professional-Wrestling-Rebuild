import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readTagTeamWorkspace,createTagTeam} from "../src/db/tag-team-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("World-portable tag pairs form once, require signed talent and survive idempotent retry",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="pairs-"+id,promotionId="company",playerId="owner-"+id;
 const personIds=["a","b","c"].map(x=>"person-"+x+"-"+id);
 const actor={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Pairing World",seed:9,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   for(const [i,personId] of personIds.entries()){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [worldId,personId,"Person "+i]);
    if(i<2)await tx.query(`INSERT INTO ppw_contracts(
      world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)
      VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)`,
      [worldId,"contract-"+i,personId,promotionId]);
   }
  });
  const before=await readTagTeamWorkspace(db.pool,actor);
  assert.equal(before.worldRevision,0);
  assert.equal(before.roster.length,2);
  assert.deepEqual(before.teams,[]);
  const request={...actor,requestId:"new",expectedRevision:0,name:"The New Blood",
   personIds:personIds.slice(0,2)};
  await assert.rejects(createTagTeam(db.pool,{...request,personIds:[personIds[0]!,personIds[2]!]}),
   /active roster/);
  assert.equal((await readTagTeamWorkspace(db.pool,actor)).worldRevision,0);
  const added=await createTagTeam(db.pool,request);
  assert.equal(added.status,"APPLIED");
  if(added.status!=="APPLIED")throw Error("Team command unexpected result");
  assert.equal((await createTagTeam(db.pool,request)).status,"REPLAYED");
  const view=await readTagTeamWorkspace(db.pool,actor);
  assert.equal(view.worldRevision,1);
  assert.deepEqual(view.teams.map(t=>t.name),["The New Blood"]);
  assert.deepEqual(view.teams[0]?.members.map(m=>m.personId).sort(),
   personIds.slice(0,2).sort());
  await assert.rejects(createTagTeam(db.pool,{...request,requestId:"duplicate",
   expectedRevision:1,name:"Another Alias"}),/already has an active/);
  await assert.rejects(readTagTeamWorkspace(db.pool,{...actor,playerId:"impostor"}),
   /access denied/);
  const rpc=await dispatchCardRpc({pool:db.pool,actor:{playerId}},"tagTeams",{
   worldId,promotionId,showId:"none",playerId:"impostor"});
  assert.equal((rpc as {teams:unknown[]}).teams.length,1);
  assert.equal((await readTagTeamWorkspace(db.pool,actor)).worldRevision,1);
  const renamed=await dispatchCardRpc({pool:db.pool,actor:{playerId}},
   "renameTagTeam",{worldId,promotionId,showId:"none",playerId:"impostor",
    teamId:added.result.teamId,name:"Renamed New Blood",
    requestId:"rename",expectedRevision:1});
  assert.equal((renamed as {status:string}).status,"APPLIED");
  assert.equal((await readTagTeamWorkspace(db.pool,actor)).teams[0]?.name,
   "Renamed New Blood");
  assert.equal((await readTagTeamWorkspace(db.pool,actor)).worldRevision,2);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_command_receipts",
    "ppw_tag_team_members","ppw_tag_teams","ppw_contracts",
    "ppw_people","ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
