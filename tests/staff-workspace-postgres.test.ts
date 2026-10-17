import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readStaffWorkspace} from "../src/db/staff-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Staff permissions remain private, opt-in, revision-guarded and frozen after lock",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const id=randomUUID(),world="staff-desk-"+id,player="player-"+id,
  other="other-"+id,promotion="promo-"+id,db=postgresPool(url!,3);
 const actor={pool:db.pool,actor:{playerId:player}};
 const request=(requestId:string,expectedRevision:number,extra:{
  allowUnfinishedFallback:boolean;allowLogisticsFallback:boolean;
  permittedDays:number[];permittedVenueIds:string[];autoRenewSameTerms?:boolean
 })=>dispatchCardRpc(actor,"setStaffContinuity",{
  worldId:world,promotionId:promotion,requestId,expectedRevision,...extra});
 const payload={autoRenewSameTerms:true,allowUnfinishedFallback:true,
  allowLogisticsFallback:true,permittedDays:[2,5],permittedVenueIds:["main"]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Staff desk",seed:52,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Promotion",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[player,other]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",[world,player,other]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",[world,player,promotion]);
   await tx.query("INSERT INTO ppw_venues(world_id,venue_id,name,status) VALUES($1,'main','Main Hall','ACTIVE'),($1,'closed','Closed Hall','INACTIVE')",[world]);
  });
  const meter=new MeasuredQuerySession("staff-permissions-two-reads");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const empty=await readStaffWorkspace(measured,{worldId:world,
   playerId:player,promotionId:promotion});
  assert.equal(empty.allowUnfinishedFallback,false);
  assert.equal(empty.allowLogisticsFallback,false);
  assert.equal(empty.autoRenewSameTerms,false);
  assert.deepEqual(empty.venues.map(v=>v.venueId),["main"]);
  assert.equal(meter.assertBudget({maxQueries:2,maxResultBytes:4500}).queryCount,2);
  assert.equal((await request("first",0,payload) as {status:string}).status,"APPLIED");
  assert.equal((await request("first",0,payload) as {status:string}).status,"REPLAYED");
  const visible=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:player});
  assert.equal(visible.allowUnfinishedFallback,true);
  assert.equal(visible.autoRenewSameTerms,true);
  assert.equal(visible.allowLogisticsFallback,true);
  assert.deepEqual(visible.permittedDays,[2,5]);
  assert.deepEqual(visible.permittedVenueIds,["main"]);
  await assert.rejects(readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:other}),/access denied/);
  await assert.rejects(dispatchCardRpc({pool:db.pool,actor:{playerId:other}},
   "setStaffContinuity",{worldId:world,promotionId:promotion,
    requestId:"intruder",expectedRevision:1,...payload}),/controller/);
  await assert.rejects(request("bad-days",1,{...payload,
   permittedDays:[2,2]}),/Invalid logistics delegation/);
  const off={autoRenewSameTerms:false,
   allowUnfinishedFallback:false,allowLogisticsFallback:false,
   permittedDays:[] as number[],permittedVenueIds:[] as string[]};
  assert.equal((await request("revoke",1,off) as {status:string}).status,"APPLIED");
  const changed=await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:player});
  assert.equal(changed.allowLogisticsFallback,false);
  assert.equal(changed.autoRenewSameTerms,false);
  assert.deepEqual(changed.permittedVenueIds,[]);
  await withWorldTransaction(db.pool,tx=>tx.query(
   "UPDATE ppw_worlds SET next_lock_at=clock_timestamp()-interval '2 seconds' WHERE world_id=$1",[world]));
  assert.equal((await readStaffWorkspace(db.pool,{worldId:world,
   promotionId:promotion,playerId:player})).canEdit,false);
  await assert.rejects(request("closed",2,payload),/closed|lock|OPEN|deadline passed/i);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_staff_continuity_settings",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_venues","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[[player,other]]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
