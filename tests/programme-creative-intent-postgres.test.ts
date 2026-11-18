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
  // A saved draft is not a performed beat. Only the exact certified
  // kind+purpose in the programme's real show history earns progress.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status)
    VALUES($1,'story-history',$2,1,1,'SUBMITTED'),
    ($1,'story-next',$2,1,2,'DRAFT')`,[worldId,promotionId]);
   for(const [draft,slot,position,kind,purpose] of [
    ["story-history","hint",0,"INTERVIEW","TEASE_BETRAYAL"],
    ["story-history","turn",1,"TURN","EXPLAIN_TURN"],
    ["story-next","rescue",0,"RESCUE","EARN_TRUST"]
   ] as const){
    await tx.query(`INSERT INTO ppw_card_slots
     (world_id,draft_id,slot_id,position,kind,payload)
     VALUES($1,$2,$3,$4,'SEGMENT',$5::jsonb)`,
     [worldId,draft,slot,position,JSON.stringify({kind,
      scene:{location:"IN_RING",visual:"NONE",purpose}})]);
    await tx.query(`INSERT INTO ppw_programme_match_activities
     (world_id,promotion_id,programme_id,draft_id,slot_id,kind)
     VALUES($1,$2,$3,$4,$5,'SEGMENT')`,
     [worldId,promotionId,programmeId,draft,slot]);
   }
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,
     crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,'story-history',1,1,'story-verification',74,'{}'::jsonb,$3)`,
    [worldId,promotionId,"c".repeat(64)]);
   for(const [slot,signature,crowd] of [
    ["hint","verified-tease",77],["turn","wrong-purpose",64]
   ] as const)await tx.query(`INSERT INTO ppw_programme_resolved_activities
    (world_id,promotion_id,programme_id,show_id,slot_id,
     week_index,kind,signature,crowd_response,impact)
    VALUES($1,$2,$3,'story-history',$4,0,'SEGMENT',$5,$6,65)`,
    [worldId,promotionId,programmeId,slot,signature,crowd]);
  });
  const proven=(await readProgrammeWorkspace(db.pool,scope)).programmes[0]!;
  assert.deepEqual(proven.blueprintProgress?.beats.map(x=>x.status),
   ["PLAYED","BOOKED","AVAILABLE"]);
  assert.equal(proven.blueprintProgress?.played,1);
  assert.equal(proven.blueprintProgress?.booked,1);
  assert.equal(proven.blueprintProgress?.suggestedBeatId,"choice");
  assert.equal(proven.blueprintProgress?.beats[0]?.playedWeekIndex,0);
  assert.equal(proven.blueprintProgress?.beats[0]?.crowdResponse,77);
  assert.deepEqual(proven.blueprintProgress?.beats[1]?.bookedAt,{
   year:1,week:2,showName:"Scheduled show",submitted:false});
  assert.equal(proven.activityCount,0,
   "A test history fixture cannot fabricate programme scoring");
  assert.equal(proven.heat,original.heat);
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
    "ppw_programme_resolved_activities","ppw_programme_match_activities",
    "ppw_card_slots","ppw_completed_shows","ppw_booking_drafts",
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
