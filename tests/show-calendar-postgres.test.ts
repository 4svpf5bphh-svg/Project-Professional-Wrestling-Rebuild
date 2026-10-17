import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {readPromotionCalendar,upsertPromotionSeries,archivePromotionSeries}
 from "../src/db/calendar-workspace.js";
import {dispatchCardRpc} from "../src/web/card-rpc.js";
const url=process.env.PPW_NEON_TEST_URL;
test("A/B television show and extra annual PPV schedules are persistent and isolated",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),suffix=randomUUID();
 const worldId="calendar-"+suffix,promotionId="company",playerId="owner-"+suffix;
 const scope={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Calendar World",seed:29,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Arena League",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:"rival",name:"WWE",tier:"GLOBAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
  });
  const before=await readPromotionCalendar(db.pool,scope);
  assert.equal(before.series.length,2);
  assert.equal(before.weeks.length,26);
  assert.ok(before.worldWeeks.some(w=>w.events.some(e=>
   e.promotionId==="rival"&&e.name==="Monday Night Raw")));
  assert.ok(before.worldWeeks.some(w=>w.events.some(e=>
   e.promotionId==="rival"&&e.name==="Friday Night SmackDown")));
  assert.ok(!JSON.stringify(before.worldWeeks).includes("draftId"));
  await assert.rejects(readPromotionCalendar(db.pool,{...scope,playerId:"intruder"}),/access denied/);
  const flagship=before.series.find(s=>s.role==="FLAGSHIP")!;
  const updated=await upsertPromotionSeries(db.pool,{...scope,requestId:"flagship",expectedRevision:0,
   series:{...flagship,name:"Arena A",cadenceWeeks:2,anchorWeek:0}});
  assert.equal(updated.status,"APPLIED");
  assert.equal((await upsertPromotionSeries(db.pool,{...scope,requestId:"flagship",
   expectedRevision:0,series:{...flagship,name:"Arena A",cadenceWeeks:2,anchorWeek:0}})).status,"REPLAYED");
  const second=await dispatchCardRpc({pool:db.pool,actor:{playerId}},"saveCalendar",{
   worldId,promotionId,requestId:"secondary",expectedRevision:1,series:{
    seriesId:"NEW",name:"Arena B",role:"SECONDARY",eventType:"REGULAR",
    cadenceWeeks:2,anchorWeek:1,importance:60,active:true}});
  assert.equal((second as {status:string}).status,"APPLIED");
  const view=await readPromotionCalendar(db.pool,scope);
  assert.equal(view.worldRevision,2);
  assert.deepEqual(view.weeks.slice(0,4).map(w=>
   w.shows.find(s=>s.eventType==="REGULAR")?.name),
   ["Arena A","Arena B","Arena A","Arena B"]);
  await assert.rejects(upsertPromotionSeries(db.pool,{...scope,requestId:"overlap",
   expectedRevision:2,series:{seriesId:"NEW",name:"Clashing B",role:"SECONDARY",
    eventType:"REGULAR",cadenceWeeks:4,anchorWeek:0,importance:50,active:true}}),/Only one normal/);
  assert.equal((await readPromotionCalendar(db.pool,scope)).worldRevision,2);
  const special=await upsertPromotionSeries(db.pool,{...scope,requestId:"ppv",
   expectedRevision:2,series:{seriesId:"NEW",name:"Arena Supercard",role:"PREMIUM",
    eventType:"MAJOR",cadenceWeeks:52,anchorWeek:1,importance:95,active:true}});
  assert.equal(special.status,"APPLIED");
  if(special.status!=="APPLIED")throw new Error("Missing series receipt");
  const seriesId=special.result.seriesId;
  assert.ok((await readPromotionCalendar(db.pool,scope)).weeks[1]!.shows.some(s=>s.seriesId===seriesId));
  assert.equal((await archivePromotionSeries(db.pool,{...scope,requestId:"archive",
   expectedRevision:3,seriesId})).status,"APPLIED");
  assert.ok(!(await readPromotionCalendar(db.pool,scope)).series.some(s=>s.seriesId===seriesId));
  await assert.rejects(archivePromotionSeries(db.pool,{...scope,requestId:"bad-archive",
   expectedRevision:4,seriesId:flagship.seriesId}),/Flagship cannot/);
  const counts=await withWorldTransaction(db.pool,tx=>tx.query<{total:string}>(
   "SELECT count(*)::text AS total FROM ppw_show_series WHERE world_id=$1",[worldId]));
  assert.equal(Number(counts[0]!.total),4);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_command_receipts","ppw_show_series",
    "ppw_promotion_controls","ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
