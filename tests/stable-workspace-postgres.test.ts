import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {readStableWorkspace,createStable,addStableMember,removeStableMember,disbandStable}
 from "../src/db/stable-workspace.js";
test("owner controls durable faction membership; roster history and reads remain bounded",
 {skip:!process.env.PPW_NEON_TEST_URL?"Disposable PostgreSQL missing":false},async()=>{
 const db=postgresPool(process.env.PPW_NEON_TEST_URL!,4),suffix=randomUUID();
 const worldId="stable-"+suffix,promotionId="promo-"+suffix,playerId="owner-"+suffix;
 const people=Array.from({length:5},(_,i)=>"talent-"+i+"-"+suffix);
 const scope={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Faction Test",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Player Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   for(let i=0;i<people.length;i++){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name) VALUES($1,$2,$3)",[worldId,people[i]!,"Member "+i]);
    await tx.query("INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index) VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+i+"-"+suffix,people[i]!,promotionId]);
   }
  });
  const created=await createStable(db.pool,{...scope,requestId:"create",expectedRevision:0,name:"The Syndicate",personIds:people.slice(0,3)});
  assert.equal(created.status,"APPLIED");
  if(created.status!=="APPLIED")throw Error("Creation did not apply");
  const stableId=created.result.stableId;
  assert.equal((await createStable(db.pool,{...scope,requestId:"create",expectedRevision:0,name:"The Syndicate",personIds:people.slice(0,3)})).status,"REPLAYED");
  await assert.rejects(createStable(db.pool,{...scope,requestId:"duplicate",expectedRevision:1,name:" the syndicate ",personIds:people.slice(2)}),
   /duplicate key|ppw_active_stable_promotion_name/i);
  assert.equal((await addStableMember(db.pool,{...scope,requestId:"join",expectedRevision:1,stableId,personId:people[3]!})).status,"APPLIED");
  assert.equal((await removeStableMember(db.pool,{...scope,requestId:"leave",expectedRevision:2,stableId,personId:people[3]!})).status,"APPLIED");
  assert.equal((await addStableMember(db.pool,{...scope,requestId:"rejoin",expectedRevision:3,stableId,personId:people[3]!})).status,"APPLIED");
  const meter=new MeasuredQuerySession("stable-roster");
  const pool:TransactionPool={async connect(){
   const conn=await db.pool.connect();
   return {release(){conn.release();},async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]=[]){
    return meter.execute(()=>conn.query<T>(sql,params));
   }};
  }};
  const view=await readStableWorkspace(pool,scope);
  assert.equal(view.stables[0]!.currentMembers.length,4);
  assert.equal(view.stables[0]!.memberHistory.filter(x=>x.personId===people[3]).length,2);
  const sample=meter.assertBudget({maxQueries:4,maxResultBytes:50_000});
  console.log("PPW stables Neon budget",JSON.stringify(sample));
  await assert.rejects(readStableWorkspace(db.pool,{...scope,playerId:"intruder"}),/access denied/);
  assert.equal((await disbandStable(db.pool,{...scope,requestId:"end",expectedRevision:4,stableId})).status,"APPLIED");
  const ended=await readStableWorkspace(db.pool,scope);
  assert.equal(ended.stables[0]!.status,"DISBANDED");
  assert.equal(ended.stables[0]!.currentMembers.length,0);
  assert.ok(ended.stables[0]!.memberHistory.every(x=>!x.active));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_ledger_events",
    "ppw_stable_memberships","ppw_stables","ppw_contracts","ppw_people",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});