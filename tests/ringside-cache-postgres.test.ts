import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Ringside cache permits only one simultaneous claim and stores immutable editorial",{
 skip:!url?"Disposable PostgreSQL unavailable":false
},async()=>{
 const db=postgresPool(url!,3),suffix=randomUUID();
 const world="editorial-world-"+suffix,promo="human-"+suffix,show="broadcast-"+suffix;
 const scope=[world,promo,show,"ringside-v1"];
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Editorial Fixture",seed:17,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promo,name:"Company",tier:"LOCAL"});
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status)
    VALUES($1,$2,$3,1,1,'SUBMITTED')`,[world,show,promo]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
    receipt_json,receipt_digest) VALUES($1,$2,$3,1,1,$4,70,$5::jsonb,$6)`,
    [world,promo,show,"resolution-"+suffix,JSON.stringify({
     worldId:world,promotionId:promo,showId:show,year:1,week:1,
     resolutionId:"resolution-"+suffix,crowdResponse:70,
     matches:[{matchId:"x",position:0,crowdResponse:70,
      actualFinish:"CLEAN_PIN",actualWinnerSide:"A"}],segments:[]
    }),"a".repeat(64)]);
  });
  const attempt=()=>withSqlClient(db.pool,tx=>tx.query<{claim_token:string}>(`
   INSERT INTO ppw_ringside_reports(world_id,promotion_id,show_id,prompt_version,
    receipt_digest,model,state,claim_token,claim_until)
   VALUES($1,$2,$3,$4,$5,'fixture','PENDING',$6,now()+interval '45 seconds')
   ON CONFLICT DO NOTHING RETURNING claim_token`,[...scope,"b".repeat(64),randomUUID()]));
  const results=await Promise.all([attempt(),attempt()]);
  assert.equal(results.filter(rows=>rows.length===1).length,1);
  const rows=await withSqlClient(db.pool,tx=>tx.query<{n:string;attempts:number;state:string}>(
   "SELECT count(*)::text AS n,min(attempts) AS attempts,min(state) AS state "+
   "FROM ppw_ringside_reports WHERE world_id=$1 AND show_id=$2",[world,show]));
  assert.deepEqual(rows[0],{n:"1",attempts:1,state:"PENDING"});
  const review={showHeadline:"A hot card",opening:"Opening night.",closing:"Good finish.",
   slots:[{slotId:"x",headline:"A winner",recap:"The match ended by clean pinfall."}]};
  await withSqlClient(db.pool,tx=>tx.query(`UPDATE ppw_ringside_reports
   SET state='READY',report_json=$5::jsonb WHERE world_id=$1 AND promotion_id=$2
    AND show_id=$3 AND prompt_version=$4`,[...scope,JSON.stringify(review)]));
  const saved=await withSqlClient(db.pool,tx=>tx.query<{report_json:unknown}>(
   "SELECT report_json FROM ppw_ringside_reports "+
   "WHERE world_id=$1 AND promotion_id=$2 AND show_id=$3 AND prompt_version=$4",scope));
  assert.deepEqual(saved[0]?.report_json,review);
  await assert.rejects(withSqlClient(db.pool,tx=>tx.query(
   "INSERT INTO ppw_ringside_reports(world_id,promotion_id,show_id,prompt_version,"+
   "receipt_digest,model,state,claim_token,claim_until) "+
   "VALUES($1,$2,'not-a-real-show',$3,$4,'fixture','PENDING','x',now())",
   [world,promo,"ringside-v1","b".repeat(64)])));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("DELETE FROM ppw_ringside_reports WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_completed_shows WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_booking_drafts WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_promotions WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
