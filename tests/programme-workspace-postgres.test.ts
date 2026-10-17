import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readProgrammeWorkspace,startProgramme,endProgramme}
 from "../src/db/programme-workspace.js";
const url=process.env.PPW_NEON_TEST_URL;
test("a player creates, inspects and ends original two-sided wrestler and tag programmes with bounded PostgreSQL",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID(),worldId="programme-"+id;
 const promotionId="p-"+id,other="other-"+id,playerId="player-"+id;
 const people=["a","b","c","d"].map(x=>x+"-"+id);
 const scope={worldId,promotionId,playerId};
 const alice={kind:"PERSON" as const,refId:people[0]!};
 const bob={kind:"PERSON" as const,refId:people[1]!};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Programme lifecycle",seed:91,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Controlled",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:other,name:"Other",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",
    [worldId,playerId,promotionId]);
   for(let i=0;i<people.length;i++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division) VALUES($1,$2,$3,'MEN')",
     [worldId,people[i]!,"Wrestler "+i]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+i+"-"+id,people[i]!,promotionId]);
   }
   await tx.query("INSERT INTO ppw_tag_teams(world_id,team_id,name,status) VALUES($1,'duo','The Unit','ACTIVE')",[worldId]);
   for(const x of people.slice(2))await tx.query(
    "INSERT INTO ppw_tag_team_members(world_id,team_id,person_id,active) VALUES($1,'duo',$2,true)",
    [worldId,x]);
   await tx.query("INSERT INTO ppw_championships(world_id,promotion_id,championship_id,name,division,status,prestige) VALUES($1,$2,'belt','Main Title','SINGLES','ACTIVE',65)",
    [worldId,promotionId]);
  });
  let view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.people.length,4);
  assert.equal(view.teams.length,1);
  assert.equal(view.championships[0]!.name,"Main Title");
  assert.equal(view.programmes.length,0);
  const one=await startProgramme(db.pool,{...scope,requestId:"start",expectedRevision:0,
   sideA:[alice],sideB:[bob],championshipId:"belt"});
  assert.equal(one.status,"APPLIED");
  if(one.status!=="APPLIED")throw Error("Must have applied");
  const replay=await startProgramme(db.pool,{...scope,requestId:"start",expectedRevision:0,
   sideA:[alice],sideB:[bob],championshipId:"belt"});
  assert.equal(replay.status,"REPLAYED");
  assert.equal(replay.result.programmeId,one.result.programmeId);
  view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.length,1);
  assert.equal(view.programmes[0]!.sideA[0]!.name,"Wrestler 0");
  assert.equal(view.programmes[0]!.championshipId,"belt");
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"duplicate",
   expectedRevision:1,sideA:[bob],sideB:[alice]}),/already exists/);
  const team=await startProgramme(db.pool,{...scope,requestId:"team",expectedRevision:1,
   sideA:[alice],sideB:[{kind:"TEAM",refId:"duo"}]});
  assert.equal(team.status,"APPLIED");
  view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.length,2);
  assert.equal(view.programmes.find(p=>p.programmeId===
   (team.status==="APPLIED"?team.result.programmeId:""))?.sideB[0]?.name,"The Unit");
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"overlap",
   expectedRevision:2,sideA:[{kind:"TEAM",refId:"duo"}],
   sideB:[{kind:"PERSON",refId:people[2]!}]}),/through two participants/);
  await assert.rejects(startProgramme(db.pool,{...scope,requestId:"foreign",
   expectedRevision:2,sideA:[alice],sideB:[{kind:"PERSON",refId:"missing"}]}),
   /current roster/);
  const intruder={...scope,playerId:"not-controller"};
  await assert.rejects(readProgrammeWorkspace(db.pool,intruder),/not accessible/);
  await assert.rejects(startProgramme(db.pool,{...intruder,requestId:"intruder",
   expectedRevision:2,sideA:[alice],sideB:[bob]}),/not accessible/);
  const finish=await endProgramme(db.pool,{...scope,requestId:"end",
   expectedRevision:2,programmeId:one.result.programmeId});
  assert.equal(finish.status,"APPLIED");
  assert.equal((await endProgramme(db.pool,{...scope,requestId:"end",
   expectedRevision:2,programmeId:one.result.programmeId})).status,"REPLAYED");
  view=await readProgrammeWorkspace(db.pool,scope);
  assert.equal(view.programmes.find(p=>p.programmeId===one.result.programmeId)?.status,"COMPLETED");
  assert.equal(view.programmes.find(p=>p.programmeId===one.result.programmeId)?.endedWeekIndex,0);
  assert.equal((await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_ledger_events WHERE world_id=$1 AND event_type LIKE 'PROGRAMME_%'",
   [worldId])))[0]!.n,"3");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_command_receipts",
    "ppw_programme_side_refs","ppw_programme_participants","ppw_programmes",
    "ppw_championship_contests","ppw_championship_reigns","ppw_championships",
    "ppw_tag_team_members","ppw_tag_teams","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
