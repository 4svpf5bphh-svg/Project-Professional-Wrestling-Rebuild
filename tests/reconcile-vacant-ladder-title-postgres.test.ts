import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {reconcileVerifiedVacantLadderTitle,
 type VerifiedVacantLadderRepair} from "../src/db/reconcile-vacant-ladder-title.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;

test("manual historic triple threat ladder correction is previewable, strict and idempotent; immutable result unchanged",{
 skip:!url?"Disposable PostgreSQL required":false
},async()=>{
 const world="reconcile-ladder-"+randomUUID(),db=postgresPool(url!,3);
 const promotion="promotion",title="intercontinental",show="week23",
  slot="three-way",winner="perfect";
 const request:VerifiedVacantLadderRepair={worldId:world,
  promotionId:promotion,championshipId:title,showId:show,slotId:slot,
  winnerPersonId:winner,year:1,week:23,mode:"PREVIEW"};
 const names=["perfect","alexander","lethal"];
 const sides=names.map((personId,i)=>({sideId:"ABC"[i]!,
  participants:[{personId,contractId:"fixture"}]}));
 const payload={matchType:"SINGLES",family:"INDIVIDUAL",sides,
  participants:sides.flatMap(s=>s.participants),scriptedWinnerSide:"A",
  scriptedWinner:winner,plannedFinish:"RETRIEVAL",stipulation:"LADDER",
  championshipId:title};
 const receipt:CompletedShowReceipt={worldId:world,promotionId:promotion,
  showId:show,year:1,week:23,resolutionId:"official",crowdResponse:80,
  matches:[{matchId:slot,position:6,crowdResponse:80,
   actualFinish:"RETRIEVAL",actualWinnerSide:"A"}],segments:[]};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Reconciliation CI",
    seed:36,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"CWA",tier:"LOCAL"});
   for(const person of names)
    await tx.query(`INSERT INTO ppw_people(world_id,person_id,name)
     VALUES($1,$2,$3)`,[world,person,person]);
   await tx.query(`
    INSERT INTO ppw_championships(world_id,promotion_id,championship_id,
     name,division,status,prestige)
    VALUES($1,$2,$3,'Intercontinental Championship','SINGLES','ACTIVE',60)`,
    [world,promotion,title]);
   await tx.query(`
    INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,
     year,week,status) VALUES($1,$2,$3,1,23,'SUBMITTED')`,
    [world,show,promotion]);
   await tx.query(`
    INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,$3,6,'MATCH',$4::jsonb)`,
    [world,show,slot,JSON.stringify(payload)]);
   await tx.query(`
    INSERT INTO ppw_completed_shows(world_id,promotion_id,show_id,
     year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,23,'official',80,$4::jsonb,repeat('a',64))`,
    [world,promotion,show,JSON.stringify(receipt)]);
   await tx.query(`
    INSERT INTO ppw_completed_show_matches(world_id,show_id,match_id,
     position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,$2,$3,6,80,'RETRIEVAL','A')`,[world,show,slot]);
   await tx.query(`
    INSERT INTO ppw_championship_contests(world_id,promotion_id,
     championship_id,show_id,slot_id,prior_reign_id,winner_person_id,title_changed)
    VALUES($1,$2,$3,$4,$5,NULL,$6,false)`,
    [world,promotion,title,show,slot,winner]);
   await tx.query(`UPDATE ppw_worlds SET week=24
    WHERE world_id=$1`,[world]);
  });
  const before=await withWorldTransaction(db.pool,tx=>
   tx.query<{revision:number;week:number}>(`
    SELECT revision,week FROM ppw_worlds WHERE world_id=$1`,[world]));
  assert.equal(await reconcileVerifiedVacantLadderTitle(db.pool,request),"ELIGIBLE");
  await assert.rejects(reconcileVerifiedVacantLadderTitle(db.pool,{
   ...request,winnerPersonId:"lethal",mode:"APPLY"}),/certified contest/);
  const untouched=await withWorldTransaction(db.pool,tx=>
   tx.query<{current_reign_id:string|null}>(`
    SELECT current_reign_id FROM ppw_championships
     WHERE world_id=$1 AND championship_id=$2`,[world,title]));
  assert.equal(untouched[0]?.current_reign_id,null);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_completed_show_matches SET actual_finish='PROTECTED_FINISH'
   WHERE world_id=$1 AND show_id=$2`,[world,show]));
  await assert.rejects(reconcileVerifiedVacantLadderTitle(db.pool,{
   ...request,mode:"APPLY"}),/certified contest/);
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_completed_show_matches SET actual_finish='RETRIEVAL'
   WHERE world_id=$1 AND show_id=$2`,[world,show]));
  assert.equal(await reconcileVerifiedVacantLadderTitle(db.pool,{
   ...request,mode:"APPLY"}),"APPLIED");
  assert.equal(await reconcileVerifiedVacantLadderTitle(db.pool,{
   ...request,mode:"APPLY"}),"ALREADY_CORRECT");
  const rows=await withWorldTransaction(db.pool,async tx=>({
   title:await tx.query<{current_reign_id:string}>(`
    SELECT current_reign_id FROM ppw_championships WHERE world_id=$1
     AND championship_id=$2`,[world,title]),
   reign:await tx.query<{person_id:string;start_week_index:number;
    status:string}>(`SELECT person_id,start_week_index,status
     FROM ppw_championship_reigns WHERE world_id=$1`,[world]),
   contest:await tx.query<{title_changed:boolean;winner_person_id:string}>(`
    SELECT title_changed,winner_person_id FROM ppw_championship_contests
     WHERE world_id=$1`,[world]),
   match:await tx.query<{actual_finish:string;actual_winner_side:string}>(`
    SELECT actual_finish,actual_winner_side FROM ppw_completed_show_matches
     WHERE world_id=$1`,[world]),
   world:await tx.query<{revision:number;week:number;phase:string}>(`
    SELECT revision,week,phase FROM ppw_worlds WHERE world_id=$1`,[world]),
   events:await tx.query<{event_type:string}>(`
    SELECT event_type FROM ppw_ledger_events WHERE world_id=$1`,[world])
  }));
  assert.equal(rows.title[0]?.current_reign_id,show+":"+slot+":new-reign");
  assert.deepEqual(rows.reign,[{person_id:winner,start_week_index:22,status:"ACTIVE"}]);
  assert.deepEqual(rows.contest,[{title_changed:true,winner_person_id:winner}]);
  assert.deepEqual(rows.match,[{actual_finish:"RETRIEVAL",actual_winner_side:"A"}]);
  assert.equal(rows.world[0]?.week,24);
  assert.equal(rows.world[0]?.phase,"OPEN");
  assert.equal(Number(rows.world[0]?.revision),Number(before[0]?.revision)+1);
  assert.deepEqual(rows.events.filter(x=>x.event_type==="HISTORICAL_LADDER_TITLE_RECONCILED"),
   [{event_type:"HISTORICAL_LADDER_TITLE_RECONCILED"}]);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_championship_contests","ppw_ledger_events",
    "ppw_completed_show_matches","ppw_completed_shows","ppw_card_slots",
    "ppw_booking_drafts","ppw_championship_reigns","ppw_championships",
    "ppw_people","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
