import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {settleCanonicalSinglesTitleContests}
 from "../src/db/championship-settlement.js";
import type {CompletedShowReceipt} from "../src/domain/completed-show-receipt.js";
const url=process.env.PPW_NEON_TEST_URL;

test("Canonical singles titles defend, transfer once on clean results and remain with champion after protected/injury finishes",{
 skip:!url?"No disposable PostgreSQL":false,
},async()=>{
 const world="titles-"+randomUUID(),promotion="championship";
 const pool=postgresPool(url!,3);
 const details=async() => withWorldTransaction(pool.pool,tx=>tx.query<{
   current_reign_id:string;status:string;person_id:string;defenses:number}>(`
   SELECT c.current_reign_id,r.status,r.person_id,r.defenses
    FROM ppw_championships c JOIN ppw_championship_reigns r
      ON r.world_id=c.world_id AND r.promotion_id=c.promotion_id
       AND r.championship_id=c.championship_id AND r.reign_id=c.current_reign_id
    WHERE c.world_id=$1`,[world]));
 const setupBout=async(show:string,winner:"A"|"B",finish:string,participants:[string,string])=>{
  await withWorldTransaction(pool.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status)
    VALUES($1,$2,$3,1,1,'SUBMITTED')`,[world,show,promotion]);
   await tx.query(`INSERT INTO ppw_card_slots(
    world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,$2,'main',0,'MATCH',$3::jsonb)`,[world,show,JSON.stringify({
     matchType:"SINGLES",participants:participants.map(personId=>({
      personId,contractId:"sample"})),championshipId:"title",scriptedWinner:participants[0]})]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,
    crowd_response,receipt_json,receipt_digest)
    VALUES($1,$2,$3,1,1,$4,78,'{}'::jsonb,repeat('a',64))`,
    [world,promotion,show,"resolve-"+show]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(
    world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,$2,'main',0,78,$3,$4)`,[world,show,finish,winner]);
  });
  const receipt:CompletedShowReceipt={
   worldId:world,promotionId:promotion,showId:show,year:1,week:1,
   resolutionId:"resolve-"+show,crowdResponse:78,
   matches:[{matchId:"main",position:0,crowdResponse:78,
    actualFinish:finish,actualWinnerSide:winner}],segments:[],
  };
  const booking=[{slotId:"main",championshipId:"title",participants}];
  return {receipt,booking};
 };
 try{
  await withWorldTransaction(pool.pool,async tx=>{
   await createWorld(tx,{id:world,name:"Championship CI",seed:11,rulesetVersion:"test"});
   await addPromotion(tx,world,{id:promotion,name:"Wrestling",tier:"LOCAL"});
   await tx.query(`INSERT INTO ppw_people(world_id,person_id,name)
    VALUES($1,'champ','Champion'),($1,'challenger','Challenger')`,[world]);
   await tx.query(`INSERT INTO ppw_championships
     (world_id,promotion_id,championship_id,name,division,status,prestige,current_reign_id)
    VALUES($1,$2,'title','World Title','SINGLES','ACTIVE',95,'first')`,
    [world,promotion]);
   await tx.query(`INSERT INTO ppw_championship_reigns
    (world_id,promotion_id,championship_id,reign_id,holder_type,person_id,status,start_week_index)
    VALUES($1,$2,'title','first','PERSON','champ','ACTIVE',0)`,[world,promotion]);
  });
  const defense=await setupBout("defense","A","CLEAN_PIN",["champ","challenger"]);
  assert.deepEqual(await withWorldTransaction(pool.pool,tx=>
   settleCanonicalSinglesTitleContests(tx,defense.receipt,defense.booking)),
   {contests:1,transfers:0});
  assert.equal((await details())[0]!.defenses,1);
  await assert.rejects(withWorldTransaction(pool.pool,tx=>
   settleCanonicalSinglesTitleContests(tx,defense.receipt,defense.booking)),/duplicate key/);
  const challenge=await setupBout("change","B","SUBMISSION",["champ","challenger"]);
  assert.deepEqual(await withWorldTransaction(pool.pool,tx=>
   settleCanonicalSinglesTitleContests(tx,challenge.receipt,challenge.booking)),
   {contests:1,transfers:1});
  assert.equal((await details())[0]!.person_id,"challenger");
  const protectedBout=await setupBout("protected","B","PROTECTED_FINISH",["challenger","champ"]);
  assert.deepEqual(await withWorldTransaction(pool.pool,tx=>
   settleCanonicalSinglesTitleContests(tx,protectedBout.receipt,protectedBout.booking)),
   {contests:1,transfers:0});
  assert.equal((await details())[0]!.person_id,"challenger");
  const records=await withWorldTransaction(pool.pool,tx=>tx.query<{
   show_id:string;title_changed:boolean;winner_person_id:string}>(`
   SELECT show_id,title_changed,winner_person_id
   FROM ppw_championship_contests WHERE world_id=$1 ORDER BY show_id`,[world]));
  assert.deepEqual(records.map(x=>[x.show_id,x.title_changed]),[
   ["change",true],["defense",false],["protected",false]]);
  assert.equal((await details())[0]!.defenses,0);
  const old=await withWorldTransaction(pool.pool,tx=>tx.query<{status:string}>(`
   SELECT status FROM ppw_championship_reigns WHERE world_id=$1 AND reign_id='first'`,[world]));
  assert.equal(old[0]!.status,"ENDED");
 }finally{
  await withWorldTransaction(pool.pool,async tx=>{
   for(const table of ["ppw_championship_contests","ppw_ledger_events",
    "ppw_completed_show_matches","ppw_completed_shows",
    "ppw_card_slots","ppw_booking_drafts",
    "ppw_championship_reigns","ppw_championships","ppw_people","ppw_promotions"])
    await tx.query(`DELETE FROM ${table} WHERE world_id=$1`,[world]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>pool.close());
 }
});
