import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {loadRingsideCommentary} from "../src/db/ringside-commentary.js";
import {RINGSIDE_PROMPT_VERSION,RINGSIDE_LEGACY_VERSION}
 from "../src/domain/ringside-editorial.js";

const url=process.env.PPW_NEON_TEST_URL;
test("An immutable legacy v4 article takes priority over newer v5 attempts in one owner-scoped query",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),worldId="legacy-ringside-"+suffix;
 const promotionId="promotion",showId="show",playerId="author";
 const db=postgresPool(url!,3);
 const copy={showHeadline:"The champion had the last word",
  opening:"It was a noisy night at ringside.",
  closing:"The next challenger has plenty to think about.",
  slots:[{slotId:"one",headline:"A fine finish",
   recap:"The main event gave the audience something to talk about on the way home."}]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Historic Ringside",seed:71,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"The League",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",
    [worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",
    [worldId,playerId,promotionId]);
   await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status) VALUES($1,$2,$3,1,1,'SUBMITTED')",
    [worldId,showId,promotionId]);
   await tx.query(`INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
    year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,'resolution',70,'{}'::jsonb,$4)`,
    [worldId,promotionId,showId,"a".repeat(64)]);
   await tx.query(`INSERT INTO ppw_ringside_reports
    (world_id,promotion_id,show_id,prompt_version,receipt_digest,model,
     state,attempts,claim_token,claim_until,report_json)
    VALUES($1,$2,$3,$4,$6,'original','READY',1,$7,now()-interval '1 hour',$8::jsonb),
     ($1,$2,$3,$5,$6,'replacement','FAILED',2,$9,now()-interval '1 hour',NULL)`,
    [worldId,promotionId,showId,RINGSIDE_LEGACY_VERSION,
     RINGSIDE_PROMPT_VERSION,"a".repeat(64),randomUUID(),JSON.stringify(copy),
     randomUUID()]);
  });
  const scope={worldId,promotionId,showId,playerId};
  assert.deepEqual(await loadRingsideCommentary(db.pool,scope,undefined),
   {status:"ready",review:copy});
  await assert.rejects(loadRingsideCommentary(db.pool,
   {...scope,playerId:"stranger"},"fake provider key"),
   /unavailable to this controller/);
  const saved=await withWorldTransaction(db.pool,tx=>tx.query<{
   prompt_version:string;state:string;report_json:unknown}>(`
    SELECT prompt_version,state,report_json FROM ppw_ringside_reports
    WHERE world_id=$1 AND show_id=$2 ORDER BY prompt_version`,[worldId,showId]));
  assert.equal(saved.length,2);
  assert.deepEqual(saved.find(x=>x.prompt_version===RINGSIDE_LEGACY_VERSION)?.report_json,copy);
  assert.equal(saved.find(x=>x.prompt_version===RINGSIDE_PROMPT_VERSION)?.state,"FAILED");
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ringside_reports","ppw_completed_shows","ppw_booking_drafts",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions","ppw_worlds"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
  }).finally(()=>db.close());
 }
});
