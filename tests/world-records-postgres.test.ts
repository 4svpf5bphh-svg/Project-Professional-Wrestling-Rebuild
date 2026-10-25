import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction,type TransactionPool} from "../src/db/transaction.js";
import {MeasuredQuerySession} from "../src/db/query-meter.js";
import {originalGenesisFixture} from "./fixtures/original-genesis.js";
import {importOriginalGenesis} from "../src/db/import-original-genesis.js";
import {joinWorld} from "../src/db/membership-operations.js";
import {submitPromotionClaim} from "../src/db/promotion-commands.js";
import {readWorldTalentRankings,searchPublicWorldCareers} from "../src/db/world-records.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("World rankings and career search respect certified weeks, two managers and strict read bounds",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="rankings-"+randomUUID(),owners=["one-"+randomUUID(),"two-"+randomUUID()],
  db=postgresPool(url!,3);
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  for(let i=0;i<2;i++){
   assert.equal((await joinWorld(db.pool,{worldId:world,playerId:owners[i]!,
    requestId:"join-"+i,expectedRevision:i*2})).status,"APPLIED");
   assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:owners[i]!,
    promotionId:"promotion-"+i,requestId:"claim-"+i,expectedRevision:i*2+1})).status,"APPLIED");
  }
  const people=await withWorldTransaction(db.pool,tx=>tx.query<{
   person_id:string;name:string;booking_division:string}>(`
   SELECT person_id,name,booking_division FROM ppw_people
   WHERE world_id=$1 AND booking_division IN ('MEN','WOMEN')
   ORDER BY person_id LIMIT 2`,[world]));
  assert.equal(people.length,2);
  const [a,b]=people;
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`INSERT INTO ppw_booking_drafts(world_id,draft_id,promotion_id,year,week,
    status,show_name,show_day)
    VALUES($1,'finished','promotion-1',1,1,'SUBMITTED','World Clash',2),
     ($1,'hidden','promotion-1',1,2,'DRAFT','PRIVATE CREATIVE PLANS',3)`,[world]);
   await tx.query(`INSERT INTO ppw_card_slots(world_id,draft_id,slot_id,position,kind,payload)
    VALUES($1,'finished','match',1,'MATCH',$2::jsonb)`,[
     world,JSON.stringify({matchType:"SINGLES",scriptedWinner:a!.person_id,
     participants:[{personId:a!.person_id,contractId:"test-a"},
      {personId:b!.person_id,contractId:"test-b"}],
     privateBookingNote:"DON'T RELEASE"})]);
   await tx.query(`INSERT INTO ppw_completed_shows(
    world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,
    receipt_json,receipt_digest)
    VALUES($1,'promotion-1','finished',1,1,'resolved',92,'{}',repeat('a',64))`,[world]);
   await tx.query(`INSERT INTO ppw_completed_show_matches(
    world_id,show_id,match_id,position,crowd_response,actual_finish,actual_winner_side)
    VALUES($1,'finished','match',1,92,'CLEAN_PIN','A')`,[world]);
   await tx.query(`INSERT INTO ppw_completed_match_report_facts(
    world_id,show_id,match_id,rating_stars,execution_quality,
    chemistry_modifier,actual_minutes)
    VALUES($1,'finished','match',4.25,86,0,15)`,[world]);
  });
  const before=await readWorldTalentRankings(db.pool,{worldId:world,
   playerId:owners[0]!,promotionId:"promotion-0"});
  assert.equal(before.leaders.length,0,"unfinished week must not leak results");
  await withWorldTransaction(db.pool,tx=>tx.query(`
   UPDATE ppw_worlds SET week=2 WHERE world_id=$1`,[world]));
  const meter=new MeasuredQuerySession("world-ranking-indexed-history");
  const measured:TransactionPool={async connect(){
   const conn=await db.pool.connect();
   return {release(){conn.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>conn.query<T>(sql,params));
    }};
  }};
  const rank=await readWorldTalentRankings(measured,{worldId:world,
   playerId:owners[0]!,promotionId:"promotion-0"});
  assert.equal(meter.assertBudget({maxQueries:2,maxResultBytes:12000}).queryCount,2);
  assert.equal(rank.leaders.length,2);
  assert.equal(rank.leaders.find(p=>p.personId===a!.person_id)?.wins,1);
  assert.equal(rank.leaders.find(p=>p.personId===b!.person_id)?.losses,1);
  assert.equal(rank.leaders[0]!.averageStars,4.25);
  const other=await readWorldTalentRankings(db.pool,{worldId:world,
   playerId:owners[1]!,promotionId:"promotion-1"});
  assert.deepEqual(other.leaders,rank.leaders);
  const search=await searchPublicWorldCareers(db.pool,{worldId:world,
   playerId:owners[0]!,promotionId:"promotion-0"},a!.name.slice(0,3));
  assert.ok(search.people.some(p=>p.personId===a!.person_id));
  assert.ok(!JSON.stringify({rank,search}).includes("PRIVATE CREATIVE PLANS"));
  assert.ok(!JSON.stringify({rank,search}).includes("DON'T RELEASE"));
  await assert.rejects(readWorldTalentRankings(db.pool,{worldId:world,
   playerId:"outsider",promotionId:"promotion-0"}),/access denied/);
  await assert.rejects(searchPublicWorldCareers(db.pool,{worldId:world,
   playerId:owners[0]!,promotionId:"promotion-0"},"%"),/2–70/);
  const rpc=await dispatchCardRpc({pool:db.pool,actor:{playerId:owners[0]!}},
   "worldRankings",{worldId:world,promotionId:"promotion-0",playerId:"outsider"});
  assert.ok(JSON.stringify(rpc).includes(a!.name));
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_completed_match_report_facts","ppw_completed_show_matches",
    "ppw_completed_shows","ppw_card_slots","ppw_booking_drafts",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_contracts","ppw_championships","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=ANY($1::text[])",[owners]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
