import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool,withSqlClient} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {loadRingsideCommentary} from "../src/db/ringside-commentary.js";
import {startWorldUpdating,processWorldUpdate} from "../src/db/world-updating.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";

const url=process.env.PPW_NEON_TEST_URL;
test("World Updating: dark week publishes once, crosses year boundary, resumes without advancing again",{skip:!url},async()=>{
 const db=postgresPool(url!,2);
 const worldId="update-"+randomUUID();
 const scope={worldId,year:1,week:52};
 let calls=0;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Updating regression",seed:123,rulesetVersion:"test"});
   await tx.query("UPDATE ppw_worlds SET year=2,week=1,phase='OPEN' WHERE world_id=$1",[worldId]);
   await startWorldUpdating(tx,scope);
  });
  const deps={groqKey:"mock",publish:async()=>{calls++;throw Error("simulated provider failure");}};
  assert.equal((await processWorldUpdate(db.pool,{worldId,year:2,week:1},deps))?.status,"BLOCKED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"PUBLISHED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"PUBLISHED");
  assert.equal(calls,1);
  const rows=await withSqlClient(db.pool,tx=>tx.query("SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1",[worldId]));
  assert.deepEqual(rows,[{year:2,week:1,phase:"OPEN"}]);
 }finally{await db.close();}
});

test("World Updating: all human shows are queued, failure is isolated, and concurrent attempts cannot double-dispatch",{skip:!url},async()=>{
 const db=postgresPool(url!,4),worldId="update-"+randomUUID(),scope={worldId,year:1,week:1};
 const owner="owner-"+worldId,rival="rival-"+worldId;
 const read=(sql:string)=>withSqlClient(db.pool,tx=>tx.query(sql,[worldId]));
 const cards=[["tv","home",5,"REGULAR"],["premium","home",7,"PREMIUM"],["rival-tv","rival",6,"REGULAR"],["ai-tv","ai",4,"REGULAR"]] as const;
 let release=()=>{},started=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve});
 const entered=new Promise<void>(resolve=>{started=resolve});
 let calls:string[]=[],publicCalls=0;
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Multi-show update",seed:17,rulesetVersion:"test"});
   for(const id of ["home","rival","ai"])await addPromotion(tx,worldId,{id,name:id,tier:"LOCAL"});
   for(const [player,promotion] of [[owner,"home"],[rival,"rival"]]){
    await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[player]);
    await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,player]);
    await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id,active) VALUES($1,$2,$3,true)",[worldId,player,promotion]);
   }
   for(const [show,promotion,day,kind] of cards){
    await tx.query("INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,status,show_day,booking_class) VALUES($1,$2,$3,1,1,'SUBMITTED',$4,$5)",[worldId,show,promotion,day,kind]);
    await tx.query("INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest) VALUES($1,$2,$3,1,1,$4,70,$5::jsonb,$6)",[worldId,promotion,show,"result-"+show,JSON.stringify({worldId,promotionId:promotion,showId:show,year:1,week:1,resolutionId:"result-"+show,crowdResponse:70,matches:[],segments:[]}),"a".repeat(64)]);
   }
   await tx.query("UPDATE ppw_worlds SET year=1,week=2,phase='OPEN' WHERE world_id=$1",[worldId]);
   await startWorldUpdating(tx,scope);
  });
  assert.deepEqual(await read("SELECT show_id FROM ppw_world_update_jobs WHERE world_id=$1 ORDER BY show_day"),[{show_id:"tv"},{show_id:"rival-tv"},{show_id:"premium"}]);
  const noDispatch:typeof fetch=async()=>{throw Error("Viewer must not dispatch Terra");};
  const viewer={worldId,playerId:owner,promotionId:"home",showId:"tv"};
  assert.deepEqual(await loadRingsideCommentary(db.pool,viewer,"mock",noDispatch,"OPENAI"),{status:"pending"});
  await assert.rejects(loadRingsideCommentary(db.pool,{...viewer,playerId:rival},"mock",noDispatch,"OPENAI"),/unavailable to this controller/);
  const deps={terraKey:"mock",groqKey:"mock",
   generate:async(_pool:typeof db.pool,s:{showId:string})=>{
    calls.push(s.showId);
    if(s.showId==="tv"){started();await gate;}
    if(s.showId==="premium")throw Error("simulated provider failure");
    return {status:"ready" as const,review:{showHeadline:"Headline",opening:"Opening",closing:"Closing",slots:[]}};
   },
   publish:async()=>{publicCalls++;throw Error("simulated public provider failure");}
  };
  const first=processWorldUpdate(db.pool,scope,deps);
  await Promise.race([entered,first.then(()=>{throw Error("Mock editorial did not start");})]);
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"BLOCKED");
  release();
  assert.equal((await first)?.status,"LIMIT_REACHED");
  await withSqlClient(db.pool,tx=>tx.query("UPDATE ppw_world_update_jobs SET state='PROCESSING',claim_until=clock_timestamp()-interval '1 second' WHERE world_id=$1 AND show_id='rival-tv'",[worldId]));
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"LIMIT_REACHED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"LIMIT_REACHED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"PUBLISHED");
  assert.equal((await processWorldUpdate(db.pool,scope,deps))?.status,"PUBLISHED");
  assert.deepEqual(calls,["tv","rival-tv","premium"]);
  assert.equal(publicCalls,1);
  assert.deepEqual(await loadRingsideCommentary(db.pool,{...viewer,showId:"premium"},"mock",noDispatch,"OPENAI"),{status:"unavailable"});
  assert.deepEqual(await read("SELECT show_id,state FROM ppw_world_update_jobs WHERE world_id=$1 ORDER BY show_day"),[{show_id:"tv",state:"READY"},{show_id:"rival-tv",state:"READY"},{show_id:"premium",state:"FALLBACK"}]);
  assert.deepEqual(await read("SELECT year,week,phase FROM ppw_worlds WHERE world_id=$1"),[{year:1,week:2,phase:"OPEN"}]);
 }finally{release();await db.close();}
});
