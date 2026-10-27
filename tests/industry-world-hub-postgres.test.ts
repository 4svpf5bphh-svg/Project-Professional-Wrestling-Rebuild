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
import {readIndustryWorldHub,readIndustryFeaturedTalent} from "../src/db/industry-world-hub.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("Industry publishes real rival broadcasts but not private unsubmitted cards or negotiations",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const world="industry-"+randomUUID(),player="owner-"+randomUUID(),
  db=postgresPool(url!,3),promotion="promotion-0";
 try{
  await importOriginalGenesis(db.pool,originalGenesisFixture(world,96));
  assert.equal((await joinWorld(db.pool,{worldId:world,playerId:player,
   requestId:"join-industry",expectedRevision:0})).status,"APPLIED");
  assert.equal((await submitPromotionClaim(db.pool,{worldId:world,playerId:player,
   promotionId:promotion,requestId:"claim-industry",expectedRevision:1})).status,"APPLIED");
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query(`
    INSERT INTO ppw_booking_drafts
     (world_id,draft_id,promotion_id,year,week,status,show_day,show_name,event_type)
    VALUES ($1,'owned','promotion-0',1,1,'SUBMITTED',2,'Own Weekly Show','REGULAR'),
      ($1,'rival','promotion-1',1,1,'SUBMITTED',4,'Rival Crown Night','MAJOR'),
      ($1,'hidden','promotion-1',1,2,'DRAFT',NULL,'PRIVATE FUTURE PLANS','MAJOR')
   `,[world]);
   await tx.query(`
    INSERT INTO ppw_completed_shows
     (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES ($1,'promotion-0','owned',1,1,'owned-resolution',72,'{}'::jsonb,repeat('a',64)),
     ($1,'promotion-1','rival',1,1,'rival-resolution',84,'{}'::jsonb,repeat('b',64))
   `,[world]);
  });
  await withWorldTransaction(db.pool,tx=>tx.query(`
   INSERT INTO ppw_ledger_events(world_id,year,week,event_type,payload)
   VALUES($1,1,1,'CAREER_STAGE_CHANGED',$2::jsonb),
    ($1,1,1,'WRESTLER_RETIRED',$3::jsonb)`,[world,
    JSON.stringify({personId:"somebody",from:"VETERAN",
     to:"SPECIAL_ATTRACTION",significance:"NOTABLE"}),
    JSON.stringify({personId:"somebody",name:"Retired Veteran",
     significance:"NOTABLE"})]));
  const meter=new MeasuredQuerySession("industry-public-weekly");
  const measured:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return meter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const hub=await readIndustryWorldHub(measured,{
   worldId:world,promotionId:promotion,playerId:player});
  assert.equal(hub.promotions.length,8);
  assert.equal(hub.year,1);assert.equal(hub.week,1);
  assert.equal(hub.phase,"OPEN");
  assert.ok(Number.isFinite(hub.nextLockEpoch));
  assert.equal(hub.promotions.filter(x=>x.isYours).length,1);
  const rival=hub.promotions.find(x=>x.promotionId==="promotion-1")!;
  assert.equal(rival.recentShowCount,1);
  assert.equal(rival.recentAverageCrowd,84);
  assert.equal(rival.publicIdentity,"Star-driven wrestling",
   "Public rival identity is derived from its already persisted AI preferences");
  assert.equal(hub.promotions.find(x=>x.isYours)?.publicIdentity,null,
   "A human controller has creative freedom, even if an older AI profile survives");
  assert.ok(!JSON.stringify(hub).includes("weekly_guarantee"));
  assert.equal(hub.broadcasts.length,2);
  assert.ok(hub.headlines.some(h=>h.kind==="CAREER_STAGE_CHANGED"&&
   h.fromStage==="VETERAN"&&h.careerStage==="SPECIAL_ATTRACTION"));
  assert.ok(hub.headlines.some(h=>h.kind==="WRESTLER_RETIRED"&&
   h.personName==="Retired Veteran"));
  assert.deepEqual(hub.broadcasts.map(x=>x.showName).sort(),
   ["Own Weekly Show","Rival Crown Night"]);
  assert.ok(!JSON.stringify(hub).includes("PRIVATE FUTURE PLANS"));
  assert.equal(hub.broadcasts.find(x=>x.showId==="owned")!.isYours,true);
  assert.equal(hub.broadcasts.find(x=>x.showId==="rival")!.isYours,false);
  assert.equal(meter.assertBudget({maxQueries:4,maxResultBytes:22000}).queryCount,4);
  // A public shortlist must be explicitly requested and never include
  // rival private contract pay, negotiations or unsubmitted plans.
  const featuredMeter=new MeasuredQuerySession("industry-featured-on-demand");
  const featuredPool:TransactionPool={async connect(){
   const client=await db.pool.connect();
   return {release(){client.release();},
    async query<T extends Record<string,unknown>>(sql:string,params:readonly unknown[]){
     return featuredMeter.execute(()=>client.query<T>(sql,params));
    }};
  }};
  const featured=await readIndustryFeaturedTalent(featuredPool,{
   worldId:world,promotionId:promotion,playerId:player,
   targetPromotionId:"promotion-1"});
  assert.equal(featuredMeter.assertBudget({maxQueries:2,maxResultBytes:8500}).queryCount,2);
  assert.equal(featured.promotionId,"promotion-1");
  assert.ok(featured.people.length<=8);
  assert.ok(featured.people.every((p,i,all)=>i===0||
   (all[i-1]!.popularity??0)>=(p.popularity??0)));
  assert.ok(!JSON.stringify(featured).includes("weeklyGuarantee"));
  assert.ok(!JSON.stringify(featured).includes("appearanceFee"));
  assert.ok(!JSON.stringify(featured).includes("PRIVATE FUTURE PLANS"));
  assert.equal((await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},
   "industryFeatured",{worldId:world,promotionId:promotion,
    targetPromotionId:"promotion-1",playerId:"spoofed"}) as typeof featured)
   .promotionId,"promotion-1");
  await assert.rejects(readIndustryFeaturedTalent(db.pool,{
   worldId:world,promotionId:promotion,playerId:"outsider",
   targetPromotionId:"promotion-1"}),/access denied/);
  await assert.rejects(readIndustryFeaturedTalent(db.pool,{
   worldId:world,promotionId:promotion,playerId:player,
   targetPromotionId:"not-a-promotion"}),/access denied/);
  const rpc=await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},"industry",{
   worldId:world,promotionId:promotion,playerId:"spoofed"}) as unknown as
    Awaited<ReturnType<typeof readIndustryWorldHub>>;
  assert.equal(rpc.broadcasts.length,2);
  // The same authenticated, show-free host scope must reach the Home and
  // promotion desks. A pending show draft is not a login prerequisite.
  const overview=await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},
   "overview",{worldId:world,promotionId:promotion,showId:"",
    playerId:"forged"}) as unknown as
     Awaited<ReturnType<typeof import("../src/db/player-world-overview.js").readPlayerWorldOverview>>;
  assert.equal(overview?.promotion?.id,promotion);
  for(const method of ["programmes","contracts","tagTeams","stables"]){
   const page=await dispatchCardRpc({pool:db.pool,actor:{playerId:player}},
    method,{worldId:world,promotionId:promotion,showId:""});
   assert.ok(page!==undefined,"Standalone "+method+" page must open");
  }

  // The compact 13-week window crosses the year boundary without scanning
  // older full-season broadcasts or leaking future drafts.
  await withWorldTransaction(db.pool,async tx=>{
   await tx.query("UPDATE ppw_worlds SET year=2,week=1 WHERE world_id=$1",[world]);
   await tx.query(`INSERT INTO ppw_booking_drafts
    (world_id,draft_id,promotion_id,year,week,status,show_day,show_name,event_type)
    VALUES($1,'year-end','promotion-1',1,52,'SUBMITTED',6,'Year-End Rival Night','MAJOR')`,
    [world]);
   await tx.query(`INSERT INTO ppw_completed_shows
    (world_id,promotion_id,show_id,year,week,resolution_id,crowd_response,receipt_json,receipt_digest)
    VALUES($1,'promotion-1','year-end',1,52,'year-end-resolution',91,'{}'::jsonb,repeat('c',64))`,
    [world]);
  });
  const rollover=await readIndustryWorldHub(db.pool,{
   worldId:world,promotionId:promotion,playerId:player});
  assert.equal(rollover.year,2);assert.equal(rollover.week,1);
  assert.deepEqual(rollover.broadcasts.map(s=>s.showName),["Year-End Rival Night"]);
  assert.equal(rollover.promotions.find(x=>x.promotionId==="promotion-1")!.recentAverageCrowd,91);
  assert.ok(!JSON.stringify(rollover).includes("PRIVATE FUTURE PLANS"));
  await assert.rejects(readIndustryWorldHub(db.pool,{
   worldId:world,promotionId:promotion,playerId:"outsider"}),/access denied/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_completed_shows","ppw_booking_drafts","ppw_ledger_events",
    "ppw_command_receipts","ppw_promotion_controls","ppw_memberships",
    "ppw_contracts","ppw_championships","ppw_people",
    "ppw_venues","ppw_promotion_market_states","ppw_promotions","ppw_markets"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[world]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[player]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[world]);
  }).finally(()=>db.close());
 }
});
