import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {createPromotionChampionship} from "../src/db/championship-management.js";
import {readChampionshipDirectory} from "../src/db/championship-history.js";
const url=process.env.PPW_NEON_TEST_URL;
test("owner can create vacant secondary and women's titles without changing the World champions",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const db=postgresPool(url!,3),id=randomUUID();
 const worldId="extra-titles-"+id,promotionId="owner-promotion-"+id,playerId="player-"+id;
 const scope={worldId,promotionId,playerId};
 try{
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Championship additions",seed:24,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:promotionId,name:"Chaotic",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1)",[playerId]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status)"+
    " VALUES($1,$2,'ACTIVE')",[worldId,playerId]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id)"+
    " VALUES($1,$2,$3)",[worldId,playerId,promotionId]);
   for(const [suffix,name,division] of [
    ["world","World Championship","SINGLES"],
    ["tag","Tag Championship","TAG"]
   ]){
    await tx.query("INSERT INTO ppw_championships("+
     "world_id,promotion_id,championship_id,name,division,status,prestige)"+
     " VALUES($1,$2,$3,$4,$5,'ACTIVE',50)",
     [worldId,promotionId,suffix,name,division]);
   }
  });
  const secondary=await createPromotionChampionship(db.pool,{...scope,
   requestId:"create-secondary",expectedRevision:0,
   kind:"SECONDARY_MEN",name:"Chaotic Intercontinental Championship"});
  assert.equal(secondary.status,"APPLIED");
  if(secondary.status!=="APPLIED")throw Error("Secondary title was not created");
  assert.equal(secondary.result.titleRole,"SECONDARY");
  assert.equal(secondary.result.bookingDivision,"MEN");
  assert.equal((await createPromotionChampionship(db.pool,{...scope,
   requestId:"create-secondary",expectedRevision:0,
   kind:"SECONDARY_MEN",name:"Chaotic Intercontinental Championship"})).status,"REPLAYED");
  const womens=await createPromotionChampionship(db.pool,{...scope,
   requestId:"create-women",expectedRevision:1,
   kind:"WOMEN_SINGLES",name:"Chaotic Women's Championship"});
  assert.equal(womens.status,"APPLIED");
  if(womens.status!=="APPLIED")throw Error("Women's title was not created");
  assert.equal(womens.result.bookingDivision,"WOMEN");
  const directory=await readChampionshipDirectory(db.pool,worldId,playerId,promotionId);
  assert.equal(directory.worldRevision,2);
  assert.equal(directory.titles.length,4);
  assert.deepEqual(directory.titles.filter(t=>t.championshipId.startsWith("created:"))
   .map(t=>({name:t.name,gender:t.bookingDivision,role:t.titleRole,holder:t.holderId}))
   .sort((a,b)=>a.gender!.localeCompare(b.gender!)),[
    {name:"Chaotic Intercontinental Championship",gender:"MEN",role:"SECONDARY",holder:null},
    {name:"Chaotic Women's Championship",gender:"WOMEN",role:"PRIMARY",holder:null}
   ]);
  assert.equal(directory.titles.filter(t=>["world","tag"].includes(t.championshipId)).length,2);
  await assert.rejects(createPromotionChampionship(db.pool,{...scope,
   requestId:"bad-owner",expectedRevision:2,playerId:"stranger",
   kind:"WOMEN_SINGLES",name:"Should Fail Championship"}),/requires an open, controlled promotion/);
  await assert.rejects(createPromotionChampionship(db.pool,{...scope,
   requestId:"duplicate-women",expectedRevision:2,
   kind:"WOMEN_SINGLES",name:"Another Women's Title"}),/already have an active title/);
 }finally{
  await withWorldTransaction(db.pool,async tx=>{
   for(const table of ["ppw_championship_reigns","ppw_championships",
    "ppw_ledger_events","ppw_command_receipts","ppw_promotion_controls",
    "ppw_memberships","ppw_promotions"])
    await tx.query("DELETE FROM "+table+" WHERE world_id=$1",[worldId]);
   await tx.query("DELETE FROM ppw_players WHERE player_id=$1",[playerId]);
   await tx.query("DELETE FROM ppw_worlds WHERE world_id=$1",[worldId]);
  }).finally(()=>db.close());
 }
});
