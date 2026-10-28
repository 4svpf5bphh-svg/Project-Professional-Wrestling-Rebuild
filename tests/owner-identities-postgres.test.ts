import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {postgresPool} from "../src/db/postgres.js";
import {withWorldTransaction} from "../src/db/transaction.js";
import {createWorld,addPromotion} from "../src/db/world-operations.js";
import {getOwnerDisplayName,saveOwnerDisplayName,renameOwnedPromotion,
 normaliseOwnerName,normalisePromotionName,fictionalPromotionOwner}
 from "../src/db/owner-identities.js";
const url=process.env.PPW_NEON_TEST_URL;
test("two signed promotion owners can name themselves and rebrand only their own company without losing IDs or history",{
 skip:!url?"No disposable PostgreSQL":false
},async()=>{
 const suffix=randomUUID(),worldId="owners-"+suffix,
  a="owner-a-"+suffix,b="owner-b-"+suffix,db=postgresPool(url!,3);
 try{
  assert.equal(normaliseOwnerName("  Josh   Robinson  "),"Josh Robinson");
  assert.throws(()=>normaliseOwnerName("!"),/3–48/);
  assert.equal(normalisePromotionName("Crown Wrestling"),"Crown Wrestling");
  assert.throws(()=>normalisePromotionName("<script>"),/3–56/);
  assert.equal(fictionalPromotionOwner("promotion-123"),fictionalPromotionOwner("promotion-123"));
  await withWorldTransaction(db.pool,async tx=>{
   await createWorld(tx,{id:worldId,name:"Owners",seed:27,rulesetVersion:"test"});
   await addPromotion(tx,worldId,{id:"crown",name:"Crown Wrestling",tier:"LOCAL"});
   await addPromotion(tx,worldId,{id:"rival",name:"Rival Wrestling",tier:"LOCAL"});
   await tx.query("INSERT INTO ppw_players(player_id) VALUES($1),($2)",[a,b]);
   await tx.query("INSERT INTO ppw_memberships(world_id,player_id,status) VALUES($1,$2,'ACTIVE'),($1,$3,'ACTIVE')",
    [worldId,a,b]);
   await tx.query("INSERT INTO ppw_promotion_controls(world_id,player_id,promotion_id) VALUES($1,$2,'crown'),($1,$3,'rival')",
    [worldId,a,b]);
  });
  assert.equal(await getOwnerDisplayName(db.pool,a),null);
  assert.deepEqual(await saveOwnerDisplayName(db.pool,a,"Josh Robinson"),
   {displayName:"Josh Robinson"});
  assert.equal(await getOwnerDisplayName(db.pool,a),"Josh Robinson");
  assert.equal(await getOwnerDisplayName(db.pool,b),null);
  await assert.rejects(renameOwnedPromotion(db.pool,{
   worldId,playerId:a,promotionId:"rival",name:"Stolen Company"}),/current owner/);
  await assert.rejects(renameOwnedPromotion(db.pool,{
   worldId,playerId:b,promotionId:"rival",name:"Crown Wrestling"}),/already uses/);
  const before=await withWorldTransaction(db.pool,tx=>tx.query<{revision:number}>(`
   SELECT revision FROM ppw_worlds WHERE world_id=$1`,[worldId]));
  const renamed=await renameOwnedPromotion(db.pool,{
   worldId,playerId:a,promotionId:"crown",name:"Kingdom Pro"});
  assert.deepEqual(renamed,{
   name:"Kingdom Pro",previousName:"Crown Wrestling",changed:true});
  assert.deepEqual(await renameOwnedPromotion(db.pool,{
   worldId,playerId:a,promotionId:"crown",name:"Kingdom Pro"}),{
   name:"Kingdom Pro",previousName:"Kingdom Pro",changed:false});
  const after=await withWorldTransaction(db.pool,tx=>tx.query<{
   name:string;promotion_id:string;revision:number;previous_name:string|null;new_name:string|null}>(`
   SELECT p.name,p.promotion_id,w.revision,
    h.previous_name,h.new_name
   FROM ppw_promotions p JOIN ppw_worlds w ON w.world_id=p.world_id
   LEFT JOIN ppw_promotion_name_history h
    ON h.world_id=p.world_id AND h.promotion_id=p.promotion_id
   WHERE p.world_id=$1 AND p.promotion_id='crown'`,[worldId]));
  assert.equal(after[0]?.name,"Kingdom Pro");
  assert.equal(after[0]?.promotion_id,"crown");
  assert.equal(after[0]?.revision,before[0]?.revision);
  assert.equal(after[0]?.previous_name,"Crown Wrestling");
  assert.equal(after[0]?.new_name,"Kingdom Pro");
  assert.equal(after.length,1,"repeated identical rename cannot add duplicate history");
  // Same World, separate authorised owners: no duplicate display names even
  // when both write on distinct promotion rows simultaneously.
  const race=await Promise.allSettled([
   renameOwnedPromotion(db.pool,{worldId,playerId:a,promotionId:"crown",name:"Premier Wrestling"}),
   renameOwnedPromotion(db.pool,{worldId,playerId:b,promotionId:"rival",name:"Premier Wrestling"})
  ]);
  assert.equal(race.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(race.filter(x=>x.status==="rejected").length,1);
  const duplicateCheck=await withWorldTransaction(db.pool,tx=>tx.query<{n:string}>(`
   SELECT name AS n FROM ppw_promotions WHERE world_id=$1
    AND lower(name)=lower('Premier Wrestling')`,[worldId]));
  assert.equal(duplicateCheck.length,1);
  const finalWorld=await withWorldTransaction(db.pool,tx=>tx.query<{revision:number}>(`
   SELECT revision FROM ppw_worlds WHERE world_id=$1`,[worldId]));
  assert.equal(finalWorld[0]?.revision,before[0]?.revision,
   "rebrands cannot accidentally advance or invalidate the World week");

 }finally{await db.close();}
});
