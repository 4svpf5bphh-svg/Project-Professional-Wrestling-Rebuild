import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {startProgramme,saveProgrammeCreativeIntent,readProgrammeWorkspace}
 from "../src/db/programme-workspace.js";

const url=process.env.PPW_NEON_TEST_URL;
test("saved Story Blueprint persists, respects owner revision/retry and leaves actual booking unchanged",
 {skip:!url?"No disposable PostgreSQL":false},async()=>{
 const db=postgresPool(url!,4),suffix=randomUUID();
 const worldId="intent-"+suffix,promotionId="promo-"+suffix,playerId="player-"+suffix;
 const alice="alice-"+suffix,bob="bob-"+suffix;
 const scope={worldId,promotionId,playerId};
 let programmeId="";
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Story Intent",seed:117,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Creative Wrestling",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)"+
    " VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   for(const [index,id] of [alice,bob].entries()){
    await tx.query("INSERT INTO ppw_people(world_id,person_id,name,booking_division)"+
     " VALUES($1,$2,$3,'MEN')",[worldId,id,index?"Bob":"Alice"]);
    await tx.query("INSERT INTO ppw_contracts("+
     "world_id,contract_id,person_id,promotion_id,family,status,remaining_dates,expires_week_index)"+
     " VALUES($1,$2,$3,$4,'EXCLUSIVE','SIGNED',NULL,52)",
     [worldId,"contract-"+index+"-"+suffix,id,promotionId]);
   }
  });
  const started=await startProgramme(db.pool,{...scope,requestId:"start",expectedRevision:0,
   sideA:[{kind:"PERSON",refId:alice}],sideB:[{kind:"PERSON",refId:bob}]});
  assert.equal(started.status,"APPLIED");
  if(started.status!=="APPLIED")return;
  programmeId=started.result.programmeId;
  const original=(await readProgrammeWorkspace(db.pool,scope)).programmes[0]!;
  assert.equal(original.creativeIntent,null);
  const creativeIntent={blueprintId:"BETRAYAL",motivation:"Doubts a trusted ally",
   audienceGoal:"Suspicion",destination:"An earned PPV confrontation"};
  const input={...scope,requestId:"save",expectedRevision:1,programmeId,creativeIntent};
  const saved=await saveProgrammeCreativeIntent(db.pool,input);
  assert.equal(saved.status,"APPLIED");
  assert.equal((await saveProgrammeCreativeIntent(db.pool,input)).status,"REPLAYED");
  const reread=(await readProgrammeWorkspace(db.pool,scope)).programmes[0]!;
  assert.deepEqual(reread.creativeIntent,creativeIntent);
  assert.equal(reread.activityCount,0);
  assert.equal(reread.matchCount,0);
  assert.equal(reread.segmentCount,0);
  assert.equal(reread.heat,original.heat);
  assert.equal((await saveProgrammeCreativeIntent(db.pool,{...input,
   requestId:"stale",expectedRevision:1})).status,"STALE");
  await assert.rejects(saveProgrammeCreativeIntent(db.pool,{...input,
   playerId:"intruder",requestId:"intruder",expectedRevision:2}),/accessible|denied|owned/i);
  const cleared=await saveProgrammeCreativeIntent(db.pool,{...scope,programmeId,
   requestId:"clear",expectedRevision:2,creativeIntent:null});
  assert.equal(cleared.status,"APPLIED");
  assert.equal((await readProgrammeWorkspace(db.pool,scope)).programmes[0]?.creativeIntent,null);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_ledger_events","ppw_command_receipts",
    "ppw_programme_finales","ppw_programme_creative_agreements",
    "ppw_programme_side_refs","ppw_programme_participants","ppw_programmes",
    "ppw_contracts","ppw_people","ppw_promotion_controls","ppw_memberships",
    "ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  });
  db.close();
 }
});
