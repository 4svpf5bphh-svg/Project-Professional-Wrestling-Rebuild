import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {rearmFailedRingsideReport} from "../src/db/admin-ringside-settings.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Admin can retry exhausted failed Ringside once without rewriting completed results",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),suffix=randomUUID(),world="ai-recovery-"+suffix,
  promo="promotion",show="show",player="owner",failed="ringside-v4";
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"AI Recovery",seed:9,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promo,name:"The League",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[world,player]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",[world,player,promo]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status) VALUES($1,$2,$3,1,1,'SUBMITTED')",[world,show,promo]);
   const receipt={worldId:world,promotionId:promo,showId:show,year:1,week:1,
    resolutionId:"resolution",crowdResponse:60,matches:[],segments:[]};
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
    year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,'resolution',60,$4::jsonb,$5)`,
    [world,promo,show,JSON.stringify(receipt),"a".repeat(64)]);
   await tx.query(`INSERT INTO ppw_ringside_reports
    (world_id,promotion_id,show_id,prompt_version,receipt_digest,model,
     state,attempts,claim_token,claim_until)
    VALUES($1,$2,$3,$4,$5,'openai/gpt-oss-120b','FAILED',2,$6,now()-interval '3 minutes')`,
    [world,promo,show,failed,"a".repeat(64),randomUUID()]);
  });
  await assert.rejects(rearmFailedRingsideReport(db.pool,world,"intruder",show),
   /not one of your completed shows/);
  assert.deepEqual(await rearmFailedRingsideReport(db.pool,world,player,show),
   {status:"ARMED",showId:show});
  const rows=await withWorldTransaction(db.pool,tx=>tx.query<{n:string;revision:string}>(`
   SELECT (SELECT count(*)::text FROM ppw_ringside_reports WHERE world_id=$1) n,
    (SELECT receipt_digest FROM ppw_completed_shows WHERE world_id=$1 AND show_id=$2) revision`,
    [world,show]));
  assert.equal(rows[0]?.n,"0");
  assert.equal(rows[0]?.revision,"a".repeat(64));
  await assert.rejects(rearmFailedRingsideReport(db.pool,world,player,show),/not exhausted/);
  const audit=await withWorldTransaction(db.pool,tx=>tx.query<{action:string}>(`
    SELECT action FROM ppw_admin_action_audit WHERE world_id=$1`,[world]));
  assert.deepEqual(audit.map(x=>x.action),["RINGSIDE_FAILED_RETRY"]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ringside_reports","ppw_admin_action_audit",
    "ppw_completed_shows","ppw_booking_drafts","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
  }).finally(()=>db.close());
 }
});
