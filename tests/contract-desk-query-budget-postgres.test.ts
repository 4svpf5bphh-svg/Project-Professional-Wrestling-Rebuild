import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readContractDesk} from "../src/db/contract-desk-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("Neon-efficiency proxy: own-roster desk is five bounded reads even with 480 rival wrestlers",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const id=randomUUID(),world="meter-"+id,owned="mine-"+id,rival="rival-"+id,
  player="manager-"+id,db=postgresPool(url!,3);
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Contract Desk query budget",seed:111,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:owned,name:"Owned",tier:"LOCAL"});
   await addPromotion(tx,world,{id:rival,name:"Rival",tier:"GLOBAL"});
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name)
    SELECT $1,'w-'||g, 'Performer '||lpad(g::text,3,'0')
    FROM generate_series(1,600) g`,[world]);
   await tx.query(`INSERT INTO ppw_contracts(world_id,contract_id,person_id,promotion_id,
    family,status,remaining_dates,expires_week_index,date_entitlement,
    weekly_guarantee,appearance_fee)
    SELECT $1,'c-'||g,'w-'||g,CASE WHEN g<=120 THEN $2 ELSE $3 END,
      'LIMITED_NON_EXCLUSIVE','SIGNED',4,25,6,100,500
    FROM generate_series(1,600) g`,[world,owned,rival]);
  });
  await joinWorld(db.pool,{worldId:world,playerId:player,
   requestId:"join-"+id,expectedRevision:0});
  await submitPromotionClaim(db.pool,{worldId:world,playerId:player,promotionId:owned,
   requestId:"claim-"+id,expectedRevision:1});
  const meter=new MeasuredQuerySession("owned-contract-desk-600-person-world");
  const measured:TransactionPool={
   async connect(){
    const client=await db.pool.connect();
    return {release(){client.release();},
     async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
      return meter.execute(()=>client.query<T>(sql,params));
     }};
   },
  };
  const result=await readContractDesk(measured,world,player,owned);
  assert.equal(result.worldRevision,2);
  assert.equal(result.canEdit,true);
  assert.equal(result.summary.signed,120);
  assert.equal(result.summary.weeklyGuarantees,12000);
  assert.equal(result.summary.backstageContractDiscussions,0);
  assert.ok(result.roster.every(c=>c.backstageContractConversationId===null));
  assert.ok(result.roster.every(c=>c.weeklyGuarantee===100&&c.appearanceFee===500));
  assert.ok(result.roster.every(c=>c.personId.startsWith("w-")));
  const sample=meter.assertBudget({maxQueries:5,maxResultBytes:100_000});
  assert.equal(sample.queryCount,5);
  assert.ok(sample.resultRows<=125);
  // Transparent bound on returned relational payload, NOT a guessed Neon bill.
  console.log("PPW Contract Desk PostgreSQL read budget:",JSON.stringify(sample));
  await assert.rejects(readContractDesk(measured,world,"stranger",owned),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
     "ppw_contracts","ppw_people","ppw_promotions"]){
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   }
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
