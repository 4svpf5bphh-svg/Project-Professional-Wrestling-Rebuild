import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readPortablePersonaWorkspace} from "../src/db/portable-persona-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("Backstage iPhone inbox avoids persona hydration: four bounded SQL reads for 600 wrestlers",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const suffix=randomUUID(),worldId="backstage-budget-"+suffix,
  promotionId="mine-"+suffix,otherId="other-"+suffix,
  playerId="owner-"+suffix,db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Neon Backstage query budget",seed:123,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Human federation",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:otherId,name:"AI federation",tier:"GLOBAL"});
   await tx.query([
    "INSERT INTO ppw_people(world_id,person_id,name)",
    "SELECT $1,'worker-'||g,'Performer '||lpad(g::text,3,'0')",
    "FROM generate_series(1,600) g"
   ].join(" "),[worldId]);
   await tx.query([
    "INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,",
    "family,status,remaining_dates,expires_week_index,date_entitlement)",
    "SELECT $1,'contract-'||g,'worker-'||g,CASE WHEN g<=100 THEN $2 ELSE $3 END,",
    "'LIMITED_NON_EXCLUSIVE','SIGNED',4,25,6",
    "FROM generate_series(1,600) g"
   ].join(" "),[worldId,promotionId,otherId]);
  });
  await joinWorld(db.pool,{worldId,playerId,requestId:"join-"+suffix,expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId,playerId,promotionId,
   requestId:"claim-"+suffix,expectedRevision:1});
  const meter=new MeasuredQuerySession("backstage-inbox-600-person-world");
  const measured:TransactionPool={
   async connect(){
    const client=await db.pool.connect();
    return {release(){client.release();},
     async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
      return meter.execute(()=>client.query<T>(sql,params));
     }};
   },
  };
  const inbox=await readPortablePersonaWorkspace(measured,{
   worldId,promotionId,playerId,inboxOnly:true});
  assert.equal(inbox.personId,null);
  assert.equal(inbox.persona,null);
  assert.equal(inbox.roster.length,100);
  assert.equal(inbox.conversations.length,0);
  assert.equal(inbox.roster.filter(x=>x.latestIncoming!==null).length,0);
  assert.ok(inbox.roster.every(x=>x.personId.startsWith("worker-")));
  const sample=meter.assertBudget({maxQueries:4,maxResultBytes:80_000});
  assert.equal(sample.queryCount,4);
  assert.ok(sample.resultRows<=110,"No rival roster or historical World data is hydrated");
  console.log("PPW Backstage inbox PostgreSQL budget:",JSON.stringify(sample));
  await assert.rejects(readPortablePersonaWorkspace(measured,{
   worldId,promotionId,playerId,personId:"worker-1",inboxOnly:true}),
   /Inbox request cannot select/);
  const beforeFull=meter.assertBudget({maxQueries:4,maxResultBytes:80_000}).queryCount;
  const thread=await readPortablePersonaWorkspace(measured,{
   worldId,promotionId,playerId,personId:"worker-1"});
  assert.equal(thread.personId,"worker-1");
  assert.ok(thread.persona);
  assert.equal(meter.assertBudget({maxQueries:12,maxResultBytes:100_000}).queryCount-beforeFull,8);
  await assert.rejects(readPortablePersonaWorkspace(measured,{
   worldId,promotionId:otherId,playerId}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_contracts","ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
