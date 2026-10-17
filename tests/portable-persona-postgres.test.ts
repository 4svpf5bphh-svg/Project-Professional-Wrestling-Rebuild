import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";
import {requestPortablePersonaChange} from "../src/db/portable-persona-change.js";
import {evaluatePersonaConsent} from "../src/domain/portable-persona-consent.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("real World: original portable wrestler identity, authored proposal, cross-promotion guard, refusal cooldown and eras",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),id=randomUUID();
 const worldId="persona-"+id,promotionId="home-"+id,
  otherPromo="rival-"+id,playerId="owner-"+id,
  otherPlayer="other-"+id,personId="prospect-"+id;
 const scope={worldId,promotionId,playerId};
 const read=<T extends Record<string,unknown>>(sql:string,params:unknown[]=[])=>
  withWorldTransaction(db.pool,tx=>tx.query<T>(sql,params));
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Character World",seed:12,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Player promotion",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:otherPromo,name:"Rival promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",
    [playerId,otherPlayer]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,playerId,otherPlayer]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3),($1,$4,$5)",
    [worldId,playerId,promotionId,otherPlayer,otherPromo]);
   await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division,popularity,recognition,morale) VALUES($1,$2,'Future Performer','MEN',20,15,50)",
    [worldId,personId]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,",
    "promotion_id,family,status,remaining_dates,expires_week_index)",
    "VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)"
   ].join(" "),[worldId,"deal-"+id,personId,promotionId]);
  });
  let view=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(view.personId,personId);
  if(!view.persona)throw Error("Expected fictional prospect baseline");
  assert.equal(view.persona.gimmickId,"AUTHENTIC");
  assert.deepEqual(view.persona.signatureMoves,[]);
  assert.equal(view.history.length,0);
  assert.equal(view.recentRequests.length,0);
  assert.equal(view.worldRevision,0);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{
   ...scope,playerId:otherPlayer}),/denied/);
  await assert.rejects(readPortablePersonaWorkspace(db.pool,{
   ...scope,personId:"unknown"}),/roster/);
  const candidates=["REBEL","MONSTER","SPORTING","HERO","OPPORTUNIST",
   "MYSTERY","VILLAIN","HIGH_FLYER","COWBOY","SHOWMAN"];
  const accepted=candidates.find(g=>evaluatePersonaConsent({
   worldSeed:"12",personId,realName:"Future Performer",
   currentGimmickId:"AUTHENTIC",requestedGimmickId:g,
   popularity:20,recognition:15,morale:50,
   creativeControl:"NONE",weeksSinceChange:0,weekIndex:0,
  }).accepted);
  assert.ok(accepted,"At least one ordinary character should be supported by fictional wrestler consent");
  const context={pool:db.pool,actor:{playerId}};
  const response=await dispatchCardRpc(context,"requestPersona",{
   worldId,promotionId,showId:"unused",requestId:"offer-"+id,
   expectedRevision:0,personId,gimmickId:accepted,playerId:"forged-user"});
  assert.equal((response as {status:string}).status,"APPLIED");
  const res=response as {status:string;result:{accepted:boolean;revision:number}};
  assert.equal(res.result.accepted,true);
  assert.equal(res.result.revision,2);
  const retry=await requestPortablePersonaChange(db.pool,{
   ...scope,personId,gimmickId:accepted!,requestId:"offer-"+id,
   expectedRevision:0});
  assert.equal(retry.status,"REPLAYED");
  view=await readPortablePersonaWorkspace(db.pool,scope);
  assert.equal(view.persona?.gimmickId,accepted);
  assert.equal(view.persona?.personaName,"Future Performer");
  assert.equal(view.history.length,1);
  assert.equal(view.history[0]!.persona.gimmickId,"AUTHENTIC");
  assert.equal(view.history[0]!.endedWeekIndex,0);
  assert.equal(view.recentRequests.length,1);
  assert.equal(view.nextPitchWeek,12);
  assert.equal((await read<{portable_gimmick_id:string}>(
   "SELECT portable_gimmick_id FROM ppw_people WHERE world_id=$1 AND person_id=$2",
   [worldId,personId]))[0]!.portable_gimmick_id,accepted);
  await assert.rejects(requestPortablePersonaChange(db.pool,{
   ...scope,personId,gimmickId:"REBEL",requestId:"again-"+id,
   expectedRevision:1}),/12 weeks/);
  // Even a signed, shared wrestler is protected from another human booker's
  // unilateral rewriting of their established portable persona.
  await withWorldTransaction(db.pool,tx=>tx.query([
   "INSERT INTO ppw_contracts(world_id,contract_id,person_id,",
   "promotion_id,family,status,remaining_dates,expires_week_index)",
   "VALUES($1,$2,$3,$4,'LIMITED_NON_EXCLUSIVE','SIGNED',10,52)"
  ].join(" "),[worldId,"other-deal-"+id,personId,otherPromo]));
  await assert.rejects(requestPortablePersonaChange(db.pool,{
   ...scope,personId,gimmickId:"SPORTING",requestId:"shared-"+id,
   expectedRevision:1}),/other human promotion/);
  assert.equal((await read<{n:string}>(
   "SELECT count(*)::text AS n FROM ppw_portable_persona_history WHERE world_id=$1",
   [worldId]))[0]!.n,"1");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_persona_change_requests",
    "ppw_portable_persona_history","ppw_portable_personas",
    "ppw_ledger_events","ppw_command_receipts","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",
    [[playerId,otherPlayer]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
